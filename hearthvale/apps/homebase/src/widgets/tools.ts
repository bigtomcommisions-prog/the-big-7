import { deleteImage, getImage, putImage } from '../store.ts';
import { h, icon } from '../dom.ts';
import { str, type WidgetDef } from './types.ts';

/** A small, safe expression evaluator (no eval): + − × ÷ ^ %, brackets, functions and constants. */
export function evaluate(src: string): number {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '').toLowerCase();
  let i = 0;
  const peek = () => s[i];
  const eat = (c: string) => (s[i] === c ? (i++, true) : false);
  const FN: Record<string, (x: number) => number> = { sqrt: Math.sqrt, sin: (x) => Math.sin((x * Math.PI) / 180), cos: (x) => Math.cos((x * Math.PI) / 180), tan: (x) => Math.tan((x * Math.PI) / 180), log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round };
  const CONST: Record<string, number> = { pi: Math.PI, e: Math.E };
  function primary(): number {
    if (eat('(')) { const v = expr(); if (!eat(')')) throw new Error(')'); return v; }
    if (eat('-')) return -primary();
    if (eat('+')) return primary();
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i));
    if (m) { i += m[0].length; return Number.parseFloat(m[0]); }
    const w = /^[a-z]+/.exec(s.slice(i));
    if (w) {
      i += w[0].length;
      if (w[0] in CONST) return CONST[w[0]]!;
      const fn = FN[w[0]];
      if (fn) return fn(primary());
    }
    throw new Error('syntax');
  }
  function power(): number {
    let v = primary();
    while (true) {
      if (eat('%')) v /= 100;
      else if (eat('^')) return v ** power();
      else return v;
    }
  }
  function term(): number {
    let v = power();
    while (peek() === '*' || peek() === '/') v = eat('*') ? v * power() : (i++, v / power());
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === '+' || peek() === '-') v = eat('+') ? v + term() : (i++, v - term());
    return v;
  }
  const v = expr();
  if (i !== s.length) throw new Error('syntax');
  return v;
}

export const calculator: WidgetDef = {
  type: 'calculator', name: 'Calculator', blurb: 'Type a sum, e.g. 12.5% of 80 or sqrt(2)^3.', icon: 'calc', defaultSize: 's', sizes: ['s', 'm'],
  defaults: () => ({}),
  render(el) {
    const input = h('input', { type: 'text', class: 'calc-in', placeholder: 'e.g. (12 + 8) × 3', 'aria-label': 'Calculation', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false' });
    const out = h('output', { class: 'calc-out', 'aria-live': 'polite' }, '0');
    const hist = h('ul', { class: 'calc-hist' });
    const run = () => {
      const q = input.value.trim().replace(/(\d+(?:\.\d+)?)%\s*of\s*/gi, '$1%*');
      if (!q) { out.textContent = '0'; return null; }
      try {
        const v = evaluate(q);
        out.textContent = Number.isFinite(v) ? Number(v.toPrecision(12)).toLocaleString('en-GB', { maximumFractionDigits: 10 }) : 'Can’t divide by zero';
        return Number.isFinite(v) ? v : null;
      } catch {
        out.textContent = '…';
        return null;
      }
    };
    input.addEventListener('input', run);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const v = run();
      if (v === null) return;
      hist.prepend(h('li', {}, `${input.value} = `, h('b', {}, out.textContent ?? '')));
      while (hist.children.length > 3) hist.lastElementChild?.remove();
      input.value = String(Number(v.toPrecision(12)));
    });
    el.append(h('h3', { class: 'w-title' }, 'Calculator'), input, out, hist);
  },
};

export const photo: WidgetDef = {
  type: 'photo', name: 'Photo frame', blurb: 'A picture you love. Stored only on this device.', icon: 'image', defaultSize: 's', sizes: ['s', 'm', 'l'],
  defaults: () => ({ caption: '', fit: 'cover' }),
  fields: [
    { key: 'caption', label: 'Caption', type: 'text' },
    { key: 'fit', label: 'Fit', type: 'select', options: [{ value: 'cover', label: 'Fill the frame' }, { value: 'contain', label: 'Whole picture' }] },
  ],
  render(el, ctx) {
    const key = `photo:${ctx.id}`;
    const frame = h('div', { class: 'photo-frame' });
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    let url: string | null = null;
    const show = async () => {
      const blob = await getImage(key);
      if (url) URL.revokeObjectURL(url);
      url = blob ? URL.createObjectURL(blob) : null;
      frame.replaceChildren(url
        ? h('img', { src: url, alt: str(ctx.config.caption, 'Photo'), style: `object-fit:${str(ctx.config.fit, 'cover')}` })
        : h('button', { class: 'photo-empty', type: 'button', onclick: () => file.click() }, icon('image', '2em'), 'Choose a photo'));
    };
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      await putImage(key, f);
      void show();
    });
    ctx.onCleanup(() => url && URL.revokeObjectURL(url));
    el.append(frame, file, str(ctx.config.caption) ? h('div', { class: 'photo-cap' }, str(ctx.config.caption)) : '');
    if (ctx.editing) {
      el.append(h('div', { class: 'row' },
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => file.click() }, icon('upload'), 'Change'),
        h('button', { class: 'btn small ghost', type: 'button', onclick: async () => { await deleteImage(key); void show(); } }, icon('trash'), 'Remove')));
    }
    void show();
  },
};
