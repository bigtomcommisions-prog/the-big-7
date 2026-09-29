import { api, type Instrument, type Point } from '../api.ts';
import { lineChart } from '../chart.ts';
import { h, icon } from '../dom.ts';
import { change, fmtDate, fmtPct, fmtValue, pct, toSec } from '../format.ts';
import { RANGES, rangeStart } from '../ranges.ts';
import { searchBox } from '../search.ts';
import { MAX_COMPARE, type Ctx } from '../state.ts';
import { changeBadge } from './overview.ts';

const PRESETS: { title: string; blurb: string; ids: string[]; range: string }[] = [
  { title: 'Eggs vs pay', blurb: 'Did US wages keep up with the price of eggs?', ids: ['us-eggs', 'us-hourly-pay'], range: '10y' },
  { title: 'Oil to the pump', blurb: 'Brent crude against what US drivers pay for petrol.', ids: ['brent', 'us-petrol'], range: '5y' },
  { title: 'Bean to cup', blurb: 'World coffee prices against a pound of ground coffee.', ids: ['coffee', 'us-coffee'], range: '10y' },
  { title: 'Field to loaf', blurb: 'Wheat on world markets against white bread in the US.', ids: ['wheat', 'us-bread'], range: '10y' },
  { title: 'UK cost of living', blurb: 'UK food and prices overall against weekly pay.', ids: ['uk-food', 'uk-cpi', 'uk-weekly-pay'], range: '10y' },
  { title: 'Crypto', blurb: 'The big coins over the last year.', ids: ['btc', 'eth', 'sol'], range: '1y' },
];

const DEFAULT_RANGE = '5y';

export async function compareView(el: HTMLElement, ctx: Ctx, params: URLSearchParams) {
  const sel = ctx.selection;
  const idsParam = params.get('ids');
  if (idsParam !== null) {
    const ids = idsParam.split(',').filter((id) => ctx.byId.get(id)?.available);
    const slots = params.get('slots')?.split(',').map(Number);
    if (ids.join(',') !== sel.ids.join(',')) sel.set(ids, slots);
  }
  const rangeKey = params.get('range') ?? DEFAULT_RANGE;
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES.find((r) => r.key === DEFAULT_RANGE)!;
  document.title = 'Compare · OmniPrice';

  const go = (r = range.key) => {
    const next = sel.size ? sel.link(r) : '#/compare';
    if (location.hash !== next) location.hash = next;
  };

  const add = searchBox(ctx, {
    placeholder: sel.size >= MAX_COMPARE ? `Up to ${MAX_COMPARE} at once` : 'Add something to compare…',
    label: 'Add to comparison',
    disabled: sel.size >= MAX_COMPARE,
    exclude: () => new Set(sel.ids),
    onPick: (inst) => { sel.add(inst.id); go(); },
  });

  const chips = h('div', { class: 'cmp-chips' }, ...sel.ids.map((id) => {
    const inst = ctx.byId.get(id)!;
    return h('span', { class: 'cmp-chip' }, h('i', { class: 'swatch', style: `background:${sel.color(id)}` }), h('a', { href: `#/i/${id}` }, inst.name),
      h('button', { type: 'button', 'aria-label': `Remove ${inst.name}`, title: 'Remove', onclick: () => { sel.remove(id); go(); } }, icon('close')));
  }), add);

  const header = h('div', { class: 'cmp-head' },
    h('h1', {}, 'Compare'),
    h('p', { class: 'lead' }, 'Put anything side by side. Each line starts at 100 at the beginning of the period, so you can see which rose or fell most, whatever it is measured in.'));

  if (!sel.size) {
    el.replaceChildren(header, chips,
      h('h2', { class: 'sub-h' }, 'Try one of these'),
      h('div', { class: 'presets' }, ...PRESETS.filter((p) => p.ids.every((id) => ctx.byId.get(id)?.available)).map((p) =>
        h('a', { class: 'preset', href: `#/compare?ids=${p.ids.join(',')}&range=${p.range}` }, h('b', {}, p.title), h('span', {}, p.blurb),
          h('span', { class: 'preset-names' }, p.ids.map((id) => ctx.byId.get(id)!.name).join(' · '))))));
    return;
  }

  const rangeBar = h('div', { class: 'seg', role: 'group', 'aria-label': 'Time range' },
    ...RANGES.filter((r) => r.key !== '1m').map((r) => h('a', { class: `seg-btn${r === range ? ' active' : ''}`, href: sel.link(r.key), 'aria-current': r === range ? 'true' : undefined }, r.label)));
  const body = h('div', { class: 'd-body' }, h('div', { class: 'skel skel-chart' }));
  const copyBtn = h('button', { class: 'btn ghost', type: 'button' }, 'Copy link');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      copyBtn.textContent = 'Copied';
    } catch {
      copyBtn.textContent = 'Copy failed';
    }
    setTimeout(() => (copyBtn.textContent = 'Copy link'), 1800);
  });
  el.replaceChildren(header, chips, h('div', { class: 'd-tools' }, rangeBar, h('div', { class: 'd-actions' }, copyBtn)), body);

  const insts = sel.ids.map((id) => ctx.byId.get(id)!);
  const loaded = await Promise.allSettled(insts.map((i) => api.series(i.id)));
  const ok: { inst: Instrument; points: Point[] }[] = [];
  const failed: string[] = [];
  loaded.forEach((r, i) => (r.status === 'fulfilled' && r.value.length ? ok.push({ inst: insts[i]!, points: r.value }) : failed.push(insts[i]!.name)));
  if (!ok.length) {
    body.replaceChildren(h('p', { class: 'notice' }, "Couldn't load these series right now. Please try again shortly."));
    return;
  }

  // Common window: from the range start (relative to the newest data) or the latest first
  // observation, whichever is later, so every line has a real starting value.
  const newest = ok.reduce((m, s) => (s.points[s.points.length - 1]![0] > m ? s.points[s.points.length - 1]![0] : m), '');
  const earliestCommon = ok.reduce((m, s) => (s.points[0]![0] > m ? s.points[0]![0] : m), '');
  const start = [rangeStart(range, newest), earliestCommon].sort().pop()!;

  const rebased = ok.map((s) => {
    const idx = s.points.findIndex((p) => p[0] >= start);
    const within = idx < 0 ? [] : s.points.slice(idx);
    const base = within[0]?.[1];
    return { ...s, within, base, map: new Map(within.map((p) => [p[0], base ? (p[1] / base) * 100 : null])) };
  }).filter((s) => s.within.length >= 2 && s.base);

  const dates = [...new Set(rebased.flatMap((s) => s.within.map((p) => p[0])))].sort();
  const chartEl = h('div', { class: 'chart-wrap' });
  const tableEl = h('div', { class: 'table-wrap' });

  const summary = rebased.map((s) => {
    const first = s.within[0]!, last = s.within[s.within.length - 1]!;
    return { ...s, first, last, change: pct(first[1], last[1]), own: change(s.inst, first[1], last[1]) };
  });
  const legend = h('ul', { class: 'legend', 'aria-label': 'Series' }, ...summary.map((s) =>
    h('li', {}, h('i', { class: 'swatch', style: `background:${sel.color(s.inst.id)}` }), h('span', {}, s.inst.name), changeBadge(s.own))));

  const sorted = [...summary].sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));
  tableEl.append(h('table', {},
    h('caption', {}, `Change from ${fmtDate(start, 'monthly')} to the latest figure`),
    h('thead', {}, h('tr', {}, ...['', 'Start', 'Latest', 'Change'].map((c) => h('th', { scope: 'col' }, c)))),
    h('tbody', {}, ...sorted.map((s) => h('tr', {},
      h('th', { scope: 'row' }, h('i', { class: 'swatch', style: `background:${sel.color(s.inst.id)}` }), s.inst.name),
      h('td', {}, fmtValue(ctx.show(s.inst), s.first[1]), h('span', { class: 'muted' }, ` ${fmtDate(s.first[0], s.inst.freq)}`)),
      h('td', {}, fmtValue(ctx.show(s.inst), s.last[1]), h('span', { class: 'muted' }, ` ${fmtDate(s.last[0], s.inst.freq)}`)),
      h('td', {}, s.own.text))))));

  body.replaceChildren(
    legend,
    chartEl,
    failed.length ? h('p', { class: 'notice' }, `Couldn't load: ${failed.join(', ')}.`) : '',
    tableEl,
    h('p', { class: 'muted small' }, 'Indexed values: 100 = the first observation on or after the start date. Monthly and daily series are plotted together; each keeps its own publication dates.',
      ctx.cur ? ` Money values are converted into ${ctx.cur}, so exchange-rate moves are included in the changes.` : ''));

  lineChart(chartEl, {
    xs: dates.map(toSec),
    series: summary.map((s) => ({
      label: s.inst.name,
      color: sel.color(s.inst.id),
      values: dates.map((d) => s.map.get(d) ?? null),
      fmt: (v) => `${v.toFixed(1)} (${fmtPct(v - 100)})`,
    })),
    dateFmt: (sec) => fmtDate(new Date(sec * 1000).toISOString().slice(0, 10), 'daily'),
    yFmt: (v) => v.toFixed(0),
    baseline: 100,
    endLabels: summary.length <= 4,
    height: 380,
  });
}
