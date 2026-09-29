import type { Catalog, Instrument } from './api.ts';
import { SERIES_COLORS } from './chart.ts';

export const MAX_COMPARE = SERIES_COLORS.length;

/**
 * The comparison basket. Each instrument keeps the colour slot it was given when added, so
 * removing one never repaints the others (colour follows the entity, not its position).
 */
export class Selection {
  private items: { id: string; slot: number }[] = [];
  private listeners = new Set<() => void>();

  get ids() {
    return this.items.map((i) => i.id);
  }
  get size() {
    return this.items.length;
  }
  has(id: string) {
    return this.items.some((i) => i.id === id);
  }
  color(id: string) {
    const slot = this.items.find((i) => i.id === id)?.slot;
    return slot === undefined ? SERIES_COLORS[0]! : SERIES_COLORS[slot]!;
  }
  add(id: string): boolean {
    if (this.has(id) || this.items.length >= MAX_COMPARE) return false;
    const used = new Set(this.items.map((i) => i.slot));
    const slot = SERIES_COLORS.findIndex((_, s) => !used.has(s));
    this.items.push({ id, slot });
    this.emit();
    return true;
  }
  remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
    this.emit();
  }
  toggle(id: string) {
    return this.has(id) ? (this.remove(id), false) : this.add(id);
  }
  /** Replace the basket (e.g. from a shared link). Slots follow the given order. */
  set(ids: string[], slots?: number[]) {
    const seen = new Set<number>();
    this.items = ids.slice(0, MAX_COMPARE).map((id, i) => {
      let slot = slots?.[i];
      if (slot === undefined || slot < 0 || slot >= MAX_COMPARE || seen.has(slot)) slot = SERIES_COLORS.findIndex((_, s) => !seen.has(s));
      seen.add(slot);
      return { id, slot };
    });
    this.emit();
  }
  /** `#/compare?ids=…&slots=…` for the current basket. */
  link(range?: string) {
    const q = new URLSearchParams({ ids: this.ids.join(','), slots: this.items.map((i) => i.slot).join(',') });
    if (range) q.set('range', range);
    return `#/compare?${q}`;
  }
  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }
}

export interface Ctx {
  catalog: Catalog;
  byId: Map<string, Instrument>;
  catName: (id: string) => string;
  selection: Selection;
  /** Chosen display currency, or null for each item's own currency. */
  cur: string | null;
  /** The instrument as it should be formatted in the display currency. */
  show: (inst: Instrument) => Instrument;
}

/** Formatting for an instrument whose money values have been converted into `cur`. */
export function inCurrency(catalog: Catalog, inst: Instrument, cur: string | null): Instrument {
  if (!cur || !inst.ccy || (inst.ccy === cur && !inst.minor)) return inst;
  const c = catalog.currencies[cur];
  if (!c) return inst;
  return {
    ...inst,
    prefix: c.symbol,
    suffix: undefined,
    decimals: c.dec === 0 ? 0 : inst.minor ? 2 : inst.decimals,
    unit: inst.unit.replace(/^(US cents|\$|£)/, c.symbol.trim()),
    convertedFrom: inst.ccy === cur ? undefined : inst.ccy,
  };
}
