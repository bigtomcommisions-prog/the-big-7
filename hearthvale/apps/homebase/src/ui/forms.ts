import { h } from '../dom.ts';
import type { ParamSpec, ParamValue } from '../themes/types.ts';
import type { Field } from '../widgets/types.ts';

let n = 0;
const fid = () => `f${++n}`;

/** A control for a theme/appearance parameter. Calls `onChange` live as it's adjusted. */
export function paramControl(spec: ParamSpec, value: ParamValue, onChange: (v: ParamValue) => void): HTMLElement {
  const id = fid();
  const label = h('label', { for: id }, spec.label);
  switch (spec.type) {
    case 'color': {
      const input = h('input', { id, type: 'color', value: String(value) });
      const hex = h('span', { class: 'hex' }, String(value));
      input.addEventListener('input', () => { hex.textContent = input.value; onChange(input.value); });
      return h('div', { class: 'ctl ctl-color' }, label, h('span', { class: 'color-wrap' }, input, hex));
    }
    case 'range': {
      const input = h('input', { id, type: 'range', min: spec.min, max: spec.max, step: spec.step, value: Number(value) });
      const out = h('output', { for: id }, fmtRange(Number(value), spec));
      input.addEventListener('input', () => { out.textContent = fmtRange(Number(input.value), spec); onChange(Number(input.value)); });
      return h('div', { class: 'ctl ctl-range' }, h('div', { class: 'ctl-row' }, label, out), input);
    }
    case 'toggle': {
      const input = h('input', { id, type: 'checkbox', role: 'switch', checked: Boolean(value) });
      input.addEventListener('change', () => onChange(input.checked));
      return h('div', { class: 'ctl ctl-toggle' }, label, input);
    }
    case 'select': {
      const sel = h('select', { id }, ...spec.options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
      sel.addEventListener('change', () => onChange(sel.value));
      return h('div', { class: 'ctl ctl-select' }, label, sel);
    }
  }
}

function fmtRange(v: number, spec: Extract<ParamSpec, { type: 'range' }>) {
  const dec = spec.step >= 1 ? 0 : spec.step >= 0.1 ? 1 : 2;
  return `${v.toFixed(dec)}${spec.unit ?? ''}`;
}

/** A control for a widget settings field. */
export function fieldControl(f: Field, value: unknown, onChange: (v: unknown) => void): HTMLElement {
  const id = fid();
  const label = h('label', { for: id }, f.label);
  const help = f.help ? h('small', { class: 'help' }, f.help) : null;
  switch (f.type) {
    case 'text':
    case 'number':
    case 'datetime': {
      const input = h('input', {
        id, type: f.type === 'datetime' ? 'datetime-local' : f.type, value: value === undefined || value === null ? '' : String(value),
        placeholder: f.placeholder, min: f.min, max: f.max,
      });
      input.addEventListener('input', () => onChange(f.type === 'number' ? Number(input.value) : input.value));
      return h('div', { class: 'ctl ctl-text' }, label, input, help);
    }
    case 'textarea': {
      const ta = h('textarea', { id, rows: 6, placeholder: f.placeholder, spellcheck: 'false' });
      ta.value = typeof value === 'string' ? value : '';
      ta.addEventListener('input', () => onChange(ta.value));
      return h('div', { class: 'ctl ctl-text' }, label, ta, help);
    }
    case 'select': {
      const sel = h('select', { id }, ...f.options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
      sel.addEventListener('change', () => onChange(sel.value));
      return h('div', { class: 'ctl ctl-select' }, label, sel, help);
    }
    case 'toggle': {
      const input = h('input', { id, type: 'checkbox', role: 'switch', checked: Boolean(value) });
      input.addEventListener('change', () => onChange(input.checked));
      return h('div', { class: 'ctl ctl-toggle' }, label, input, help);
    }
    case 'multi': {
      const set = new Set(Array.isArray(value) ? (value as string[]) : []);
      return h('fieldset', { class: 'ctl ctl-multi' }, h('legend', {}, f.label), help,
        h('div', { class: 'multi-grid' }, ...f.options.map((o) => {
          const cb = h('input', { type: 'checkbox', checked: set.has(o.value) });
          cb.addEventListener('change', () => { if (cb.checked) set.add(o.value); else set.delete(o.value); onChange(f.options.map((x) => x.value).filter((v) => set.has(v))); });
          return h('label', { class: 'multi-opt' }, cb, o.label);
        })));
    }
  }
}
