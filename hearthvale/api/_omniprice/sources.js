// Fetchers for each upstream provider. Every fetcher returns points as [ISO date, value][],
// sorted oldest-first, with missing observations dropped.

const UA = 'OmniPrice/1.0 (+https://bigtomdev.fyi/omniprice/)';

export class SourceError extends Error {
  /** @param {string} message @param {number} [status] */
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

/** @param {string} url @param {'json'|'text'} as */
async function get(url, as) {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: as === 'json' ? 'application/json' : 'text/csv,*/*' }, signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new SourceError(`Could not reach the data provider (${/** @type {Error} */ (err).name}).`);
  }
  if (res.status === 429) throw new SourceError('The data provider is rate limiting requests. Try again in a minute.', 503);
  if (!res.ok) throw new SourceError(`The data provider returned an error (${res.status}).`);
  return as === 'json' ? res.json() : res.text();
}

/** @param {[string, number][]} pts */
function tidy(pts) {
  const byDate = new Map();
  for (const [d, v] of pts) if (Number.isFinite(v)) byDate.set(d, v);
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

/** FRED: official API when FRED_API_KEY is set, otherwise the public CSV download. */
async function fred(feed, env) {
  const scale = feed.scale ?? 1;
  if (env.FRED_API_KEY) {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(feed.id)}&api_key=${encodeURIComponent(env.FRED_API_KEY)}&file_type=json`;
    const data = await get(url, 'json');
    return tidy(data.observations.map((o) => [o.date, Number.parseFloat(o.value) * scale]));
  }
  const csv = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(feed.id)}`, 'text');
  const rows = csv.trim().split(/\r?\n/).slice(1);
  return tidy(rows.map((r) => {
    const [d, v] = r.split(',');
    return [d, Number.parseFloat(v) * scale];
  }));
}

/** ONS time series JSON (monthly, else quarterly, else yearly observations). */
async function ons(feed) {
  const data = await get(`https://www.ons.gov.uk/${feed.path}/data`, 'json');
  const scale = feed.scale ?? 1;
  const toDate = (/** @type {string} */ s) => {
    let m = /^(\d{4}) ([A-Z]{3})$/.exec(s);
    if (m) return `${m[1]}-${MONTHS[m[2]]}-01`;
    m = /^(\d{4}) Q([1-4])$/.exec(s);
    if (m) return `${m[1]}-${String((Number(m[2]) - 1) * 3 + 1).padStart(2, '0')}-01`;
    m = /^(\d{4})$/.exec(s);
    return m ? `${m[1]}-01-01` : null;
  };
  const obs = data.months?.length ? data.months : data.quarters?.length ? data.quarters : data.years ?? [];
  return tidy(obs.flatMap((o) => {
    const d = toDate(o.date);
    return d && o.value !== '' ? [[d, Number.parseFloat(o.value) * scale]] : [];
  }));
}

/**
 * ECB reference rates via Frankfurter. One request per base currency returns every quote's full
 * daily history since 1999 (~3.5 MB), cached for an hour and shared by all pairs and conversions.
 * @type {Map<string, { at: number, promise: Promise<Map<string, [string, number][]>> }>}
 */
const ecbBases = new Map();
const ECB_TTL_MS = 60 * 60_000;

function ecbBase(base) {
  const hit = ecbBases.get(base);
  if (hit && Date.now() - hit.at < ECB_TTL_MS) return hit.promise;
  const promise = get(`https://api.frankfurter.dev/v1/1999-01-04..?from=${encodeURIComponent(base)}`, 'json').then((data) => {
    /** @type {Map<string, [string, number][]>} */
    const byQuote = new Map();
    for (const [date, rates] of Object.entries(data.rates ?? {})) {
      for (const [q, r] of Object.entries(rates)) {
        if (!byQuote.has(q)) byQuote.set(q, []);
        byQuote.get(q).push([date, Number(r)]);
      }
    }
    for (const [q, pts] of byQuote) byQuote.set(q, tidy(pts));
    return byQuote;
  });
  ecbBases.set(base, { at: Date.now(), promise });
  promise.catch(() => {
    if (ecbBases.get(base)?.promise === promise) {
      if (hit) ecbBases.set(base, hit);
      else ecbBases.delete(base);
    }
  });
  return promise;
}

async function ecb(feed) {
  const pts = (await ecbBase(feed.base)).get(feed.quote);
  if (!pts?.length) throw new SourceError(`No ECB rates for ${feed.base}/${feed.quote}.`);
  return pts;
}

/** Daily rates: units of `quote` per 1 `base`. */
export function fxRates(base, quote) {
  return ecb({ base, quote });
}

/** CoinGecko public API (keyless tier: up to 365 days of daily history). */
async function coingecko(feed) {
  const data = await get(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(feed.coin)}/market_chart?vs_currency=usd&days=365&interval=daily`, 'json');
  return tidy((data.prices ?? []).map(([ms, p]) => [new Date(ms).toISOString().slice(0, 10), p]));
}

/** Twelve Data daily closes (requires TWELVE_DATA_API_KEY). */
async function twelvedata(feed, env) {
  if (!env.TWELVE_DATA_API_KEY) throw new SourceError('Stock data is not configured on this server.', 503);
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(feed.symbol)}&interval=1day&outputsize=5000&apikey=${encodeURIComponent(env.TWELVE_DATA_API_KEY)}`;
  const data = await get(url, 'json');
  if (data.status === 'error') throw new SourceError(data.code === 429 ? 'The stock data provider is rate limiting requests. Try again in a minute.' : 'The stock data provider returned an error.', data.code === 429 ? 503 : 502);
  return tidy((data.values ?? []).map((v) => [v.datetime.slice(0, 10), Number.parseFloat(v.close)]));
}

const FETCHERS = { fred, ons, ecb, coingecko, twelvedata };

/**
 * @param {import('./catalog.js').Instrument['feed']} feed
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<[string, number][]>}
 */
export function fetchFeed(feed, env) {
  return FETCHERS[feed.kind](/** @type {never} */ (feed), env);
}
