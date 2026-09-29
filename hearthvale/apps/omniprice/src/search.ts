import type { Instrument } from './api.ts';
import type { Ctx } from './state.ts';
import { h, icon } from './dom.ts';

/** An accessible combobox over the instrument catalogue. */
export function searchBox(ctx: Ctx, opts: { placeholder: string; label: string; onPick: (inst: Instrument) => void; exclude?: () => Set<string>; disabled?: boolean }): HTMLElement {
  const listId = `sb-${Math.random().toString(36).slice(2, 8)}`;
  const input = h('input', {
    type: 'search', placeholder: opts.placeholder, 'aria-label': opts.label, role: 'combobox', 'aria-expanded': 'false',
    'aria-controls': listId, 'aria-autocomplete': 'list', autocomplete: 'off', spellcheck: 'false', disabled: opts.disabled,
  });
  const list = h('ul', { class: 'sb-list', id: listId, role: 'listbox', hidden: true });
  let matches: Instrument[] = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  };
  const pick = (inst: Instrument) => {
    input.value = '';
    close();
    opts.onPick(inst);
  };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    const excluded = opts.exclude?.() ?? new Set<string>();
    const terms = q.split(/\s+/).filter(Boolean);
    matches = ctx.catalog.instruments.filter((i) => {
      if (!i.available || excluded.has(i.id)) return false;
      const hay = `${i.name} ${ctx.catName(i.cat)} ${i.region} ${i.unit}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    }).slice(0, 8);
    if (!q || !matches.length) {
      list.replaceChildren(q ? h('li', { class: 'sb-empty' }, 'No matches') : '');
      list.hidden = !q;
      input.setAttribute('aria-expanded', String(!!q));
      return;
    }
    active = Math.min(Math.max(active, 0), matches.length - 1);
    list.replaceChildren(...matches.map((m, i) => h('li', {
      id: `${listId}-${i}`, role: 'option', 'aria-selected': String(i === active), class: i === active ? 'active' : '',
      onmousedown: (e: Event) => { e.preventDefault(); pick(m); },
    }, h('span', { class: 'sb-name' }, m.name), h('span', { class: 'sb-meta' }, `${ctx.catName(m.cat)} · ${m.region}`))));
    input.setAttribute('aria-activedescendant', `${listId}-${active}`);
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => setTimeout(close, 100));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!matches.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      render();
    } else if (e.key === 'Enter' && matches[active]) {
      e.preventDefault();
      pick(matches[active]!);
    } else if (e.key === 'Escape') {
      input.value = '';
      close();
    }
  });
  return h('div', { class: 'sb' }, icon('search'), input, list);
}
