import { api, type Instrument, type Point } from '../api.ts';
import { lineChart, SERIES_COLORS } from '../chart.ts';
import { h, icon } from '../dom.ts';
import { change, fmtDate, fmtValue, FREQ_LABEL, toSec } from '../format.ts';
import { DEFAULT_RANGE, RANGES, slice, usableRanges } from '../ranges.ts';
import type { Ctx } from '../state.ts';
import { changeBadge } from './overview.ts';

export function sourceBox(ctx: Ctx, inst: Instrument): HTMLElement {
  const src = ctx.catalog.sources[inst.source];
  return h('aside', { class: 'source' },
    h('div', {}, h('b', {}, 'Source: '), h('a', { href: src?.url ?? '#', target: '_blank', rel: 'noopener noreferrer' }, src?.name ?? inst.source),
      src?.via ? `, via ${src.via}` : '', '.'),
    h('div', { class: 'muted' }, `${src?.licence ?? ''} · ${FREQ_LABEL[inst.freq]} data · figures may be revised by the publisher.`),
    inst.note ? h('div', { class: 'muted' }, inst.note) : null,
    inst.convertedFrom ? h('div', { class: 'muted' }, `Converted from ${inst.convertedFrom} at European Central Bank reference rates (the average rate for each ${inst.freq === 'daily' || inst.freq === 'weekly' ? 'day' : inst.freq === 'monthly' ? 'month' : 'quarter'}). Converted history starts in 1999.`) : null);
}

/** Price of a US food item in minutes of average US work, now and ten years earlier. */
async function workTime(inst: Instrument, points: Point[]): Promise<HTMLElement | null> {
  if (inst.cat !== 'food' || inst.region !== 'US') return null;
  const wages = await api.series('us-hourly-pay').catch(() => null);
  if (!wages?.length) return null;
  const wageAt = (date: string) => {
    for (let i = wages.length - 1; i >= 0; i--) if (wages[i]![0] <= date) return wages[i]![1];
    return null;
  };
  const last = points[points.length - 1]!;
  const w = wageAt(last[0]);
  if (!w) return null;
  const minutes = (last[1] / w) * 60;
  const decadeAgo = `${Number(last[0].slice(0, 4)) - 10}${last[0].slice(4)}`;
  const then = [...points].reverse().find((p) => p[0] <= decadeAgo);
  const wThen = then ? wageAt(then[0]) : null;
  const minutesThen = then && wThen ? (then[1] / wThen) * 60 : null;
  return h('div', { class: 'stat worktime' },
    h('span', { class: 'stat-label' }, 'Work time to buy it'),
    h('span', { class: 'stat-val' }, `${minutes.toFixed(1)} min`),
    h('span', { class: 'stat-sub' }, 'at the US average hourly wage',
      minutesThen && then ? ` · ${minutesThen.toFixed(1)} min in ${then[0].slice(0, 4)}` : ''));
}

export async function detailView(el: HTMLElement, ctx: Ctx, id: string, rangeKey: string | null) {
  const raw = ctx.byId.get(id);
  if (!raw) {
    el.replaceChildren(h('div', { class: 'empty' }, h('h1', {}, 'Not found'), h('p', {}, 'OmniPrice does not track that yet.'), h('a', { class: 'btn', href: '#/' }, 'All prices')));
    return;
  }
  const inst = ctx.show(raw);
  const back = h('a', { class: 'back', href: `#/?cat=${inst.cat}` }, icon('back'), ctx.catName(inst.cat));
  const title = h('div', { class: 'd-title' }, h('h1', {}, inst.name), h('p', { class: 'muted' }, `${inst.unit} · ${inst.region} · ${FREQ_LABEL[inst.freq]}`));
  const body = h('div', { class: 'd-body' }, h('div', { class: 'skel skel-chart' }));
  el.replaceChildren(back, title, body);
  document.title = `${inst.name} · OmniPrice`;

  let points: Point[];
  try {
    points = await api.series(inst.id);
  } catch (err) {
    body.replaceChildren(h('p', { class: 'notice' }, (err as Error).message), sourceBox(ctx, inst));
    return;
  }

  const ranges = usableRanges(points);
  const range = ranges.find((r) => r.key === rangeKey) ?? ranges.find((r) => r.key === DEFAULT_RANGE[inst.freq]) ?? ranges[ranges.length - 1]!;
  const view = slice(points, range);
  const first = view[0]!, last = view[view.length - 1]!;
  const periodChange = change(inst, first[1], last[1]);
  const values = view.map((p) => p[1]);
  const hi = view.reduce((a, b) => (b[1] > a[1] ? b : a));
  const lo = view.reduce((a, b) => (b[1] < a[1] ? b : a));
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  const headline = h('div', { class: 'd-head' },
    h('div', { class: 'd-val' }, fmtValue(inst, last[1])),
    h('div', { class: 'd-chg' }, changeBadge(periodChange), h('span', { class: 'muted' }, ` ${last[1] - first[1] >= 0 ? '+' : ''}${fmtValue(inst, last[1] - first[1])} since ${fmtDate(first[0], inst.freq)}`)),
    h('div', { class: 'muted' }, `Latest: ${fmtDate(last[0], inst.freq)}`));

  const rangeBar = h('div', { class: 'seg', role: 'group', 'aria-label': 'Time range' },
    ...RANGES.filter((r) => ranges.includes(r)).map((r) => h('a', { class: `seg-btn${r === range ? ' active' : ''}`, href: `#/i/${inst.id}?range=${r.key}`, 'aria-current': r === range ? 'true' : undefined }, r.label)));

  const inBasket = () => ctx.selection.has(inst.id);
  const cmpBtn = h('button', { class: 'btn', type: 'button' }, icon(inBasket() ? 'check' : 'compare'), inBasket() ? 'View comparison' : 'Compare');
  cmpBtn.disabled = !inBasket() && ctx.selection.size >= 5;
  cmpBtn.addEventListener('click', () => {
    if (!inBasket()) ctx.selection.add(inst.id);
    location.hash = ctx.selection.link();
  });

  const chartEl = h('div', { class: 'chart-wrap' });
  const tableEl = h('div', { class: 'table-wrap', hidden: true });
  const tableBtn = h('button', { class: 'btn ghost', type: 'button', 'aria-pressed': 'false' }, icon('table'), 'Table');
  tableBtn.addEventListener('click', () => {
    const show = tableEl.hidden;
    tableEl.hidden = !show;
    chartEl.hidden = show;
    tableBtn.setAttribute('aria-pressed', String(show));
    tableBtn.replaceChildren(icon(show ? 'chart' : 'table'), show ? 'Chart' : 'Table');
  });

  // Table view: newest first, at most ~250 rows (evenly thinned for long daily ranges).
  const step = Math.max(1, Math.ceil(view.length / 250));
  const rows = view.filter((_, i) => i % step === 0 || i === view.length - 1).reverse();
  tableEl.append(h('table', {},
    h('caption', { class: 'sr-only' }, `${inst.name}, ${inst.unit}`),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Date'), h('th', { scope: 'col' }, 'Value'), h('th', { scope: 'col' }, 'Change'))),
    h('tbody', {}, ...rows.map((p, i) => {
      const older = rows[i + 1];
      return h('tr', {}, h('td', {}, fmtDate(p[0], inst.freq)), h('td', {}, fmtValue(inst, p[1])), h('td', {}, older ? change(inst, older[1], p[1]).text : '–'));
    }))));

  const stat = (label: string, val: string, sub: string) => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-val' }, val), h('span', { class: 'stat-sub' }, sub));
  const stats = h('div', { class: 'stats' },
    stat('High', fmtValue(inst, hi[1]), fmtDate(hi[0], inst.freq)),
    stat('Low', fmtValue(inst, lo[1]), fmtDate(lo[0], inst.freq)),
    stat('Average', fmtValue(inst, avg), range.months === 'max' ? 'over all data' : `over ${range.label}`),
    stat('Data since', fmtDate(points[0]![0], inst.freq), `${points.length.toLocaleString('en-GB')} observations`));

  body.replaceChildren(
    headline,
    h('div', { class: 'd-tools' }, rangeBar, h('div', { class: 'd-actions' }, tableBtn, cmpBtn)),
    chartEl, tableEl, stats, sourceBox(ctx, inst));

  lineChart(chartEl, {
    xs: view.map((p) => toSec(p[0])),
    series: [{ label: inst.name, color: SERIES_COLORS[0]!, values, fmt: (v) => fmtValue(inst, v) }],
    dateFmt: (s) => fmtDate(new Date(s * 1000).toISOString().slice(0, 10), inst.freq),
    yFmt: (v) => fmtValue(inst, v, Math.abs(v) >= 1000 ? 0 : Math.min(inst.decimals, 2)),
    area: true,
  });

  const wt = await workTime(inst, points);
  if (wt) stats.append(wt);
}
