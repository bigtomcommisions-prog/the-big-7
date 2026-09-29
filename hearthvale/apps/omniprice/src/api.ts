export type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface Instrument {
  id: string;
  name: string;
  cat: string;
  region: string;
  unit: string;
  prefix?: string;
  suffix?: string;
  decimals: number;
  freq: Frequency;
  source: string;
  note?: string;
  available: boolean;
  /** ISO currency of money values; absent for rates, indices and percentages. */
  ccy?: string;
  /** Values are in minor units (US cents). */
  minor?: boolean;
  /** Set on display copies whose values were converted into another currency. */
  convertedFrom?: string;
}

export interface CurrencyInfo {
  name: string;
  plural: string;
  symbol: string;
  dec: number;
}

export interface Source {
  name: string;
  via?: string;
  licence: string;
  url: string;
}

export interface Catalog {
  categories: { id: string; name: string }[];
  sources: Record<string, Source>;
  currencies: Record<string, CurrencyInfo>;
  instruments: Instrument[];
}

/** [ISO date, value] */
export type Point = [string, number];

export interface Summary {
  id: string;
  last?: Point;
  prev?: Point | null;
  yearAgo?: Point | null;
  spark?: number[];
  error?: string;
}

const ENDPOINT = '/api/omniprice';

async function get<T>(params: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?${new URLSearchParams(params)}`);
  } catch {
    throw new Error("Couldn't reach OmniPrice. Check your connection.");
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body;
}

const seriesCache = new Map<string, Promise<Point[]>>();

/** Display currency for money values (null = each item's own currency). */
let displayCurrency: string | null = null;
export const setDisplayCurrency = (c: string | null) => (displayCurrency = c);
const withCur = (params: Record<string, string>) => (displayCurrency ? { ...params, cur: displayCurrency } : params);

export const api = {
  catalog: () => get<Catalog>({ op: 'catalog' }),
  overview: (q: { cat: string } | { ids: string[] }) =>
    get<{ items: Summary[] }>(withCur('cat' in q ? { op: 'overview', cat: q.cat } : { op: 'overview', ids: q.ids.join(',') })).then((r) => r.items),
  series(id: string): Promise<Point[]> {
    const key = `${id}@${displayCurrency ?? ''}`;
    let p = seriesCache.get(key);
    if (!p) {
      p = get<{ points: Point[] }>(withCur({ op: 'series', id })).then((r) => r.points);
      seriesCache.set(key, p);
      p.catch(() => seriesCache.delete(key));
    }
    return p;
  },
};
