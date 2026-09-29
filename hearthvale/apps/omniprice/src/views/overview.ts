import { api, type Instrument, type Summary } from '../api.ts';
import { SERIES_COLORS, sparkline } from '../chart.ts';
import { h, icon } from '../dom.ts';
import { change, direction, fmtDate, fmtValue, type Change, PERIOD } from '../format.ts';
import type { Ctx } from '../state.ts';

const HEADLINES = ['brent', 'gbp-usd', 'btc', 'us-eggs', 'wheat', 'uk-weekly-pay', 'uk-inflation', 'spy'];

export function changeBadge(c: Change, extra?: string): HTMLElement {
  const dir = direction(c.value);
  return h('span', { class: `chg ${dir}` }, icon(dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'flat'),
    h('span', { class: 'sr-only' }, dir === 'up' ? 'Up ' : dir === 'down' ? 'Down ' : 'Unchanged '), c.text,
    extra ? h('span', { class: 'chg-extra' }, ` ${extra}`) : null);
}

function compareToggle(ctx: Ctx, inst: Instrument): HTMLButtonElement {
  const btn = h('button', { class: 'cmp-toggle', type: 'button' });
  const sync = () => {
    const on = ctx.selection.has(inst.id);
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? `Remove ${inst.name} from comparison` : `Add ${inst.name} to comparison`;
    btn.setAttribute('aria-label', btn.title);
    btn.replaceChildren(icon(on ? 'check' : 'add'));
    btn.disabled = !on && ctx.selection.size >= 5;
  };
  btn.addEventListener('click', () => ctx.selection.toggle(inst.id));
  // Stop listening once the card has left the page.
  const off = ctx.selection.onChange(() => (btn.isConnected ? sync() : off()));
  sync();
  return btn;
}

function card(ctx: Ctx, raw: Instrument, s: Summary | null): HTMLElement {
  const inst = ctx.show(raw);
  const top = h('div', { class: 'card-top' }, h('span', { class: 'card-name' }, inst.name), h('span', { class: 'region' }, inst.region));
  const link = h('a', { class: 'card-link', href: `#/i/${inst.id}` }, top);
  if (!s) {
    link.append(h('div', { class: 'skel skel-val' }), h('div', { class: 'skel skel-spark' }));
  } else if (s.error || !s.last) {
    link.append(h('p', { class: 'card-err' }, s.error ?? 'No data'));
  } else {
    const chg: Change = s.prev ? change(inst, s.prev[1], s.last[1]) : { value: null, text: '–' };
    const yoy = s.yearAgo ? change(inst, s.yearAgo[1], s.last[1]).text : '–';
    link.append(
      h('div', { class: 'card-val' }, fmtValue(inst, s.last[1])),
      h('div', { class: 'card-unit' }, inst.unit),
      h('div', { class: 'card-chg' }, changeBadge(chg), h('span', { class: 'muted' }, ` ${PERIOD[inst.freq]}`)),
      sparkline(s.spark ?? [], SERIES_COLORS[0]!),
      h('div', { class: 'card-foot' }, h('span', {}, fmtDate(s.last[0], inst.freq)), h('span', {}, '1 year: ', h('b', {}, yoy))),
    );
  }
  return h('article', { class: 'card' }, link, compareToggle(ctx, raw));
}

export async function overviewView(el: HTMLElement, ctx: Ctx, cat: string | null) {
  const { categories, instruments } = ctx.catalog;
  const cats = cat ? categories.filter((c) => c.id === cat) : categories;

  // Headline strip
  const headIds = HEADLINES.filter((id) => ctx.byId.get(id)?.available);
  const strip = h('div', { class: 'strip', role: 'list' });
  const stripTile = (raw: Instrument, s?: Summary, inst = ctx.show(raw)) => h('a', { class: 'strip-tile', href: `#/i/${inst.id}`, role: 'listitem' },
    h('span', { class: 'strip-name' }, inst.name),
    s?.last ? h('span', { class: 'strip-val' }, fmtValue(inst, s.last[1])) : h('span', { class: 'skel skel-line' }),
    s?.last ? changeBadge(s.prev ? change(inst, s.prev[1], s.last[1]) : { value: null, text: '–' }) : null);
  strip.replaceChildren(...headIds.map((id) => stripTile(ctx.byId.get(id)!)));

  const chips = h('nav', { class: 'chips', 'aria-label': 'Categories' },
    h('a', { class: `chip${cat ? '' : ' active'}`, href: '#/', 'aria-current': cat ? undefined : 'page' }, 'All'),
    ...categories.map((c) => h('a', { class: `chip${c.id === cat ? ' active' : ''}`, href: `#/?cat=${c.id}`, 'aria-current': c.id === cat ? 'page' : undefined }, c.name)));

  const sections = cats.map((c) => {
    const list = instruments.filter((i) => i.cat === c.id);
    // On the "All" page each category shows its first 8; the category page shows everything.
    const all = list.filter((i) => i.available);
    const avail = cat ? all : all.slice(0, 8);
    const grid = h('div', { class: 'grid' }, ...avail.map((i) => card(ctx, i, null)));
    const section = h('section', { class: 'cat-section', 'aria-labelledby': `cat-${c.id}` },
      h('div', { class: 'cat-head' }, h('h2', { id: `cat-${c.id}` }, c.name), cat ? null : h('a', { class: 'see-all', href: `#/?cat=${c.id}` }, all.length > avail.length ? `See all ${all.length} ` : 'Only this category ', icon('next'))),
      avail.length ? grid : h('p', { class: 'notice' }, c.id === 'stocks'
        ? 'Live stock prices need a licensed market data feed, which is being set up. Everything else on OmniPrice is live.'
        : 'No data available right now.'));
    return { c, avail, grid, section };
  });

  el.replaceChildren(...[
    cat ? null : h('section', { class: 'hero' },
      h('h1', {}, 'The price of ', h('span', { class: 'grad' }, 'everything'), '.'),
      h('p', { class: 'lead' }, 'Food, wages, energy, commodities, currencies, crypto and inflation, tracked from official and open sources. Tap ', icon('add'), ' on anything to compare it.')),
    cat ? null : strip,
    chips,
    ...sections.map((s) => s.section),
  ].filter((n): n is HTMLElement => n !== null));

  const loadHeadlines = cat ? Promise.resolve() : api.overview({ ids: headIds }).then((items) => {
    const byId = new Map(items.map((s) => [s.id, s]));
    strip.replaceChildren(...headIds.map((id) => stripTile(ctx.byId.get(id)!, byId.get(id))));
  }).catch(() => undefined);

  await Promise.all([loadHeadlines, ...sections.filter((s) => s.avail.length).map(async (s) => {
    try {
      const items = await api.overview(cat ? { cat: s.c.id } : { ids: s.avail.map((i) => i.id) });
      const byId = new Map(items.map((x) => [x.id, x]));
      s.grid.replaceChildren(...s.avail.map((i) => card(ctx, i, byId.get(i.id) ?? { id: i.id, error: 'No data' })));
    } catch (err) {
      s.grid.replaceChildren(h('p', { class: 'notice' }, (err as Error).message));
    }
  })]);
}
