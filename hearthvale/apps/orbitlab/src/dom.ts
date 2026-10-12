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

/** Reads and writes JSON in localStorage, ignoring private-mode and quota errors. */
export const store = {
  get<T>(key: string): T | null {
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};

/** Saves a Blob as a download. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  h('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** The small header shared by the Big 7 tools: a link home, the app name and the legal links. */
export function topBar(name: string, legalId: string, ...extra: Node[]): HTMLElement {
  return h('header', { class: 'top' },
    h('a', { class: 'home', href: '/the-big-7/', 'aria-label': 'Big Tom Dev, The Big 7' }, 'Big 7'),
    h('h1', {}, name),
    ...extra,
    h('nav', { class: 'legal', 'aria-label': 'Legal' }, h('a', { href: `/privacy/#${legalId}` }, 'Privacy'), h('a', { href: '/terms/' }, 'Terms')));
}
