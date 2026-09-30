import { createElement, ChevronUp, LogOut, Share2 } from 'lucide';

type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | number | null | undefined | false;

/** Tiny hyperscript helper. Text children are always inserted as text (never as HTML). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = { up: ChevronUp, leave: LogOut, share: Share2 };

export function icon(name: keyof typeof ICONS): SVGElement {
  const svg = createElement(ICONS[name]);
  svg.setAttribute('width', '1.1em');
  svg.setAttribute('height', '1.1em');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}
