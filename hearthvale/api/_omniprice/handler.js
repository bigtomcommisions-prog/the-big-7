// OmniPrice API. Runs as a Vercel Function (api/omniprice.js) and inside the Vite dev server.
//
//   GET /api/omniprice?op=catalog              instruments, categories, sources
//   GET /api/omniprice?op=series&id=<id>       full history for one instrument
//   GET /api/omniprice?op=overview&cat=<cat>   latest values + sparklines for a category
//   GET /api/omniprice?op=overview&ids=a,b,c   same, for specific instruments (max 12)
//   …&cur=GBP                                  show money values in another currency (ECB rates)
//
// Upstream data changes at most daily, so responses are cached in memory per instance and at
// Vercel's CDN. Visitors' browsers only ever talk to us, never to the data providers.
import { CATEGORIES, CURRENCIES, INSTRUMENTS, SOURCES, byId } from './catalog.js';
import { SourceError, fetchFeed, fxRates } from './sources.js';

const TTL_MS = { daily: 30 * 60_000, weekly: 3 * 3600_000, monthly: 6 * 3600_000, quarterly: 12 * 3600_000 };
/** @type {Map<string, { at: number, promise: Promise<[string, number][]> }>} */
const cache = new Map();

/** @param {import('./catalog.js').Instrument} inst @param {Record<string, string | undefined>} env */
function series(inst, env) {
  const hit = cache.get(inst.id);
  if (hit && Date.now() - hit.at < TTL_MS[inst.freq]) return hit.promise;
  const promise = fetchFeed(inst.feed, env).then((pts) => {
    if (!pts.length) throw new SourceError('The data provider returned no data.');
    return pts;
  });
  cache.set(inst.id, { at: Date.now(), promise });
  promise.catch(() => {
    // Keep serving the previous good copy if we have one; otherwise forget the failure.
    if (cache.get(inst.id)?.promise === promise) {
      if (hit) cache.set(inst.id, hit);
      else cache.delete(inst.id);
    }
  });
  return promise;
}

/** Index of the first point on or after `date`. */
function lowerBound(pts, date) {
  let lo = 0, hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] < date) lo = mid + 1; else hi = mid;
  }
  return lo;
}

const DAY = 86_400_000;
const addMonths = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Convert a money series with daily FX rates (units of target per unit of source). Daily and
 * weekly prices use that day's rate (or the last business day's); monthly and quarterly figures use
 * the average rate over their period. Points before the FX history starts (1999) are dropped.
 */
function convert(points, fx, inst) {
  const div = inst.minor ? 100 : 1;
  const months = inst.freq === 'monthly' ? 1 : inst.freq === 'quarterly' ? 3 : 0;
  const out = [];
  for (const [d, v] of points) {
    let rate = null;
    if (months) {
      const end = addMonths(d, months);
      let sum = 0, n = 0;
      for (let i = lowerBound(fx, d); i < fx.length && fx[i][0] < end; i++) { sum += fx[i][1]; n++; }
      if (n) rate = sum / n;
    } else {
      const b = atOrBefore(fx, d);
      if (b && Date.parse(d) - Date.parse(b[0]) <= 7 * DAY) rate = b[1];
    }
    if (rate !== null) out.push([d, (v * rate) / div]);
  }
  return out;
}

/** @type {Map<string, { at: number, promise: Promise<[string, number][]> }>} */
const converted = new Map();

/** The series as shown: converted into `cur` when it is a money amount in another currency. */
function display(inst, env, cur) {
  if (!cur || !inst.ccy || (inst.ccy === cur && !inst.minor)) return series(inst, env);
  const key = `${inst.id}@${cur}`;
  const hit = converted.get(key);
  if (hit && Date.now() - hit.at < TTL_MS[inst.freq]) return hit.promise;
  const promise = Promise.all([series(inst, env), inst.ccy === cur ? null : fxRates(inst.ccy, cur)]).then(([pts, fx]) => {
    const out = fx ? convert(pts, fx, inst) : pts.map(([d, v]) => [d, v / 100]);
    if (!out.length) throw new SourceError('No exchange rates cover this period.');
    return out;
  });
  converted.set(key, { at: Date.now(), promise });
  promise.catch(() => converted.get(key)?.promise === promise && converted.delete(key));
  return promise;
}

const available = (inst, env) => inst.feed.kind !== 'twelvedata' || Boolean(env.TWELVE_DATA_API_KEY);

function publicInstrument(inst, env) {
  const { feed, ...rest } = inst;
  return { ...rest, available: available(inst, env) };
}

/** Find the observation closest to (on or before) `targetDate`. */
function atOrBefore(pts, targetDate) {
  let lo = 0, hi = pts.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= targetDate) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best >= 0 ? pts[best] : null;
}

/** Latest, previous, a year earlier, and a ~60-point sparkline of the last year. */
function summary(pts) {
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2] ?? null;
  const d = new Date(`${last[0]}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  const target = d.toISOString().slice(0, 10);
  // Series that start just after the one-year mark (e.g. 365 days of crypto) still get a 1-year change.
  const yearAgo = atOrBefore(pts, target) ?? (Date.parse(pts[0][0]) - Date.parse(target) <= 7 * 86400_000 ? pts[0] : null);
  const since = d.toISOString().slice(0, 10);
  const lastYear = pts.filter((p) => p[0] >= since);
  const step = Math.max(1, Math.ceil(lastYear.length / 60));
  const spark = lastYear.filter((_, i) => i % step === 0 || i === lastYear.length - 1).map((p) => p[1]);
  return { last, prev, yearAgo, spark };
}

/** @param {unknown} body @param {number} status @param {number} [maxAge] seconds of CDN caching */
function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=300, s-maxage=${maxAge}, stale-while-revalidate=86400` : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

const errorBody = (err) => ({ error: err instanceof SourceError ? err.message : 'Something went wrong fetching this data.' });

/**
 * @param {URL} url
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<Response>}
 */
export async function handle(url, env) {
  const op = url.searchParams.get('op');
  const cur = url.searchParams.get('cur') || null;
  if (cur && !Object.hasOwn(CURRENCIES, cur)) return json({ error: 'Unknown currency.' }, 400);
  try {
    if (op === 'catalog') {
      return json({
        categories: CATEGORIES,
        sources: SOURCES,
        currencies: CURRENCIES,
        instruments: INSTRUMENTS.map((i) => publicInstrument(i, env)),
      }, 200, 3600);
    }

    if (op === 'series') {
      const inst = byId.get(url.searchParams.get('id') ?? '');
      if (!inst) return json({ error: 'Unknown instrument.' }, 404);
      if (!available(inst, env)) return json({ error: 'This data source is not configured.' }, 503);
      const points = await display(inst, env, cur);
      return json({ id: inst.id, cur, points }, 200, inst.freq === 'daily' ? 1800 : 6 * 3600);
    }

    if (op === 'overview') {
      const cat = url.searchParams.get('cat');
      const ids = url.searchParams.get('ids');
      let list;
      if (cat) {
        if (!CATEGORIES.some((c) => c.id === cat)) return json({ error: 'Unknown category.' }, 404);
        list = INSTRUMENTS.filter((i) => i.cat === cat);
      } else if (ids) {
        list = ids.split(',').slice(0, 12).map((id) => byId.get(id)).filter(Boolean);
      } else {
        return json({ error: 'Pass cat or ids.' }, 400);
      }
      const results = await Promise.allSettled(list.map(async (inst) => {
        if (!available(inst, env)) return { id: inst.id, error: 'Not configured' };
        return { id: inst.id, ...summary(await display(inst, env, cur)) };
      }));
      const items = results.map((r, i) => (r.status === 'fulfilled' ? r.value : { id: list[i].id, ...errorBody(r.reason) }));
      const anyError = items.some((it) => 'error' in it && it.error !== 'Not configured');
      // Cache partial failures only briefly so they recover quickly.
      return json({ items }, 200, anyError ? 120 : 1800);
    }

    return json({ error: 'Unknown operation.' }, 400);
  } catch (err) {
    const status = err instanceof SourceError ? err.status : 500;
    if (!(err instanceof SourceError)) console.error('OmniPrice error', err);
    return json(errorBody(err), status);
  }
}
