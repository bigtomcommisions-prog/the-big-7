import { createElement, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChartLine, Check, GitCompareArrows, Minus, Plus, Search, Table, X as Close } from 'lucide';

type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | number | null | undefined | false;

/** Tiny hyperscript helper. Text children are always inserted as text (never as HTML). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = { up: ArrowUp, down: ArrowDown, flat: Minus, back: ArrowLeft, next: ArrowRight, compare: GitCompareArrows, add: Plus, check: Check, close: Close, search: Search, table: Table, chart: ChartLine };
export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size = '1em'): SVGElement {
  const svg = createElement(ICONS[name]);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  return svg;
}
