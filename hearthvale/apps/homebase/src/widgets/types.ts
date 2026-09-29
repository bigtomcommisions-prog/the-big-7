import type { IconName } from '../dom.ts';
import type { General, Size } from '../store.ts';

/** A field in a widget's settings form (rendered automatically). */
export type Field =
  | { key: string; label: string; type: 'text' | 'number' | 'datetime' | 'textarea'; placeholder?: string; help?: string; min?: number; max?: number }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; help?: string }
  | { key: string; label: string; type: 'toggle'; help?: string }
  | { key: string; label: string; type: 'multi'; options: { value: string; label: string }[]; help?: string };

export interface WidgetCtx {
  readonly config: Record<string, unknown>;
  /** Merge into the saved config (no re-render). */
  save(patch: Record<string, unknown>): void;
  readonly general: General;
  readonly size: Size;
  readonly editing: boolean;
  readonly id: string;
  /** True when rendered as the page first opens (not after later changes). */
  readonly initial: boolean;
  /** Run `fn` now and every `ms`; stopped automatically when the widget unmounts. */
  every(ms: number, fn: () => void): void;
  onCleanup(fn: () => void): void;
}

export interface WidgetDef {
  type: string;
  name: string;
  blurb: string;
  icon: IconName;
  defaultSize: Size;
  sizes: Size[];
  defaults(): Record<string, unknown>;
  fields?: Field[];
  render(el: HTMLElement, ctx: WidgetCtx): void;
}

export const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
export const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const bool = (v: unknown, d = false) => (typeof v === 'boolean' ? v : d);

export function timeString(d: Date, g: General, opts: { seconds?: boolean; timeZone?: string } = {}) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: g.use24h ? '2-digit' : 'numeric', minute: '2-digit', second: opts.seconds ? '2-digit' : undefined, hour12: !g.use24h, timeZone: opts.timeZone,
  }).format(d);
}
