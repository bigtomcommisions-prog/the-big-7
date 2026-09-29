import type { Frequency, Instrument } from './api.ts';

export function fmtValue(inst: Pick<Instrument, 'prefix' | 'suffix' | 'decimals'>, v: number, decimals = inst.decimals): string {
  const n = Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${v < 0 ? '−' : ''}${inst.prefix ?? ''}${n}${inst.suffix ?? ''}`;
}

export function pct(from: number, to: number): number | null {
  return from === 0 ? null : ((to - from) / Math.abs(from)) * 100;
}

export function fmtPct(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return '–';
  const s = Math.abs(p) >= 100 ? Math.abs(p).toFixed(0) : Math.abs(p).toFixed(Math.abs(p) >= 10 ? 1 : 2);
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${s}%`;
}

export interface Change { value: number | null; text: string }

/** Change between two values: percentage for prices, percentage points for rates (e.g. 3.1% → 3.3% is +0.20 pts). */
export function change(inst: Pick<Instrument, 'suffix'>, from: number, to: number): Change {
  if (inst.suffix === '%') {
    const d = to - from;
    return { value: d, text: `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(2)} pts` };
  }
  const p = pct(from, to);
  return { value: p, text: fmtPct(p) };
}

export function direction(p: number | null): 'up' | 'down' | 'flat' {
  if (p === null || Math.abs(p) < 0.005) return 'flat';
  return p > 0 ? 'up' : 'down';
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso: string, freq: Frequency): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  if (freq === 'quarterly') return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
  if (freq === 'monthly') return `${MON[m - 1]} ${y}`;
  return `${d} ${MON[m - 1]} ${y}`;
}

export const PERIOD: Record<Frequency, string> = {
  daily: 'on the previous day',
  weekly: 'on the previous week',
  monthly: 'on the previous month',
  quarterly: 'on the previous quarter',
};

export const FREQ_LABEL: Record<Frequency, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly' };

/** Seconds since epoch for an ISO date (uPlot's x unit). */
export const toSec = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000;
