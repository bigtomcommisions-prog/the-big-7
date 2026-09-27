import { icon, type IconName } from './icons.ts';

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

export function guildIcon(name: string, icon: string | null): HTMLElement {
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3) || '?';
  return icon ? h('div', { class: 'guild-icon' }, h('img', { src: icon, alt: '' })) : h('div', { class: 'guild-icon' }, initials);
}

/** Is the user currently typing in a form field? (Game keys are ignored while true.) */
export function isTyping(): boolean {
  const a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a as HTMLElement).isContentEditable);
}

export class Toasts {
  readonly el = h('div', { class: 'toasts' });
  show(text: string, kind: 'info' | 'error' = 'info', ms = 3500, iconName?: IconName) {
    const ic = iconName ?? (kind === 'error' ? 'warning' : undefined);
    const t = h('div', { class: `toast panel ${kind === 'error' ? 'error' : ''}` }, ic ? icon(ic) : null, text);
    this.el.append(t);
    while (this.el.children.length > 4) this.el.firstElementChild?.remove();
    setTimeout(() => t.remove(), ms);
  }
}
