import type { Frequency, Point } from './api.ts';

export interface Range {
  key: string;
  label: string;
  months: number | 'ytd' | 'max';
}

export const RANGES: Range[] = [
  { key: '1m', label: '1M', months: 1 },
  { key: '3m', label: '3M', months: 3 },
  { key: '6m', label: '6M', months: 6 },
  { key: 'ytd', label: 'YTD', months: 'ytd' },
  { key: '1y', label: '1Y', months: 12 },
  { key: '5y', label: '5Y', months: 60 },
  { key: '10y', label: '10Y', months: 120 },
  { key: 'max', label: 'Max', months: 'max' },
];

export const DEFAULT_RANGE: Record<Frequency, string> = { daily: '1y', weekly: '1y', monthly: '5y', quarterly: '10y' };

/** Start date (ISO) of a range ending at `end`. */
export function rangeStart(r: Range, end: string): string {
  if (r.months === 'max') return '0000-01-01';
  const d = new Date(`${end}T00:00:00Z`);
  if (r.months === 'ytd') return `${d.getUTCFullYear()}-01-01`;
  d.setUTCMonth(d.getUTCMonth() - r.months);
  return d.toISOString().slice(0, 10);
}

/** Points within the range, plus the last point before it so period changes have a base. */
export function slice(points: Point[], r: Range): Point[] {
  if (!points.length || r.months === 'max') return points;
  const start = rangeStart(r, points[points.length - 1]![0]);
  const i = points.findIndex((p) => p[0] >= start);
  if (i < 0) return points.slice(-1);
  return points.slice(Math.max(0, points[i]![0] > start ? i - 1 : i));
}

/** Ranges that would show at least 3 observations for this series. */
export function usableRanges(points: Point[]): Range[] {
  const firstDate = points[0]?.[0] ?? '';
  return RANGES.filter((r) => {
    if (r.months === 'max') return true;
    // Skip ranges longer than the history (they'd look identical to Max).
    if (typeof r.months === 'number' && rangeStart(r, points[points.length - 1]![0]) < firstDate) return false;
    return slice(points, r).length >= 3;
  });
}
