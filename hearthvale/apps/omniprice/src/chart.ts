import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { h } from './dom.ts';

/** Categorical slots (dark mode), validated as a set on the #1b1f27 chart surface. Fixed order. */
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];

const INK = '#eef0f5';
const INK_MUTED = '#9ba3b4';
const GRID = '#2a303c';
const SURFACE = '#1b1f27';
const FONT = '12px Nunito, system-ui, sans-serif';

export interface ChartSeries {
  label: string;
  color: string;
  values: (number | null)[];
  /** Formats a value for the tooltip. */
  fmt: (v: number) => string;
}

export interface ChartOptions {
  /** x values in seconds since epoch, ascending. */
  xs: number[];
  series: ChartSeries[];
  dateFmt: (sec: number) => string;
  yFmt: (v: number) => string;
  /** Shade under a single line. */
  area?: boolean;
  /** Name each line at its last point (for comparisons with ≤ 4 series). */
  endLabels?: boolean;
  /** A horizontal reference line (e.g. 100 on an indexed chart). */
  baseline?: number;
  height?: number;
}

function hexToRgba(hex: string, a: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Last non-null value at or before index i (so monthly series still read on a daily axis). */
function valueAt(values: (number | null)[], i: number): { v: number; i: number } | null {
  for (let j = i; j >= 0; j--) {
    const v = values[j];
    if (v !== null && v !== undefined) return { v, i: j };
  }
  return null;
}

export function lineChart(container: HTMLElement, o: ChartOptions): { destroy(): void } {
  container.replaceChildren();
  container.classList.add('chart');
  const tip = h('div', { class: 'chart-tip', role: 'status', 'aria-live': 'off' });
  container.append(tip);
  const height = o.height ?? 340;

  const endLabels = (u: uPlot) => {
    if (!o.endLabels) return;
    const ctx = u.ctx;
    const dpr = uPlot.pxRatio;
    const labels = o.series.map((s, si) => {
      const last = valueAt(s.values, o.xs.length - 1);
      if (!last) return null;
      return { s, x: u.valToPos(o.xs[last.i]!, 'x', true), y: u.valToPos(last.v, 'y', true), si };
    }).filter((l): l is NonNullable<typeof l> => l !== null).sort((a, b) => a.y - b.y);
    // Nudge labels apart so they never overlap.
    const gap = 16 * dpr;
    for (let i = 1; i < labels.length; i++) labels[i]!.y = Math.max(labels[i]!.y, labels[i - 1]!.y + gap);
    ctx.save();
    ctx.font = `700 ${12 * dpr}px Nunito, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const l of labels) {
      ctx.beginPath();
      ctx.arc(l.x, u.valToPos(valueAt(l.s.values, o.xs.length - 1)!.v, 'y', true), 4 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = l.s.color;
      ctx.strokeStyle = SURFACE;
      ctx.lineWidth = 2 * dpr;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      const name = l.s.label.length > 16 ? `${l.s.label.slice(0, 15)}…` : l.s.label;
      // Labels sit in the right-hand gutter, clear of the lines.
      ctx.fillText(name, u.bbox.left + u.bbox.width + 12 * dpr, l.y);
    }
    ctx.restore();
  };

  const baseline = (u: uPlot) => {
    if (o.baseline === undefined) return;
    const y = u.valToPos(o.baseline, 'y', true);
    const ctx = u.ctx;
    ctx.save();
    ctx.strokeStyle = '#4a5263';
    ctx.lineWidth = uPlot.pxRatio;
    ctx.beginPath();
    ctx.moveTo(u.bbox.left, y);
    ctx.lineTo(u.bbox.left + u.bbox.width, y);
    ctx.stroke();
    ctx.restore();
  };

  const setTip = (u: uPlot) => {
    const idx = u.cursor.idx;
    if (idx === null || idx === undefined || u.cursor.left === undefined || u.cursor.left < 0) {
      tip.style.opacity = '0';
      return;
    }
    const rows = o.series.map((s) => {
      const hit = valueAt(s.values, idx);
      return hit ? h('div', { class: 'tip-row' }, h('i', { style: `background:${s.color}` }), h('span', {}, s.label), h('b', {}, s.fmt(hit.v))) : null;
    });
    tip.replaceChildren(h('div', { class: 'tip-date' }, o.dateFmt(o.xs[idx]!)), ...rows.filter((r): r is HTMLDivElement => r !== null));
    tip.style.opacity = '1';
    const left = u.cursor.left + u.over.offsetLeft;
    const top = (u.cursor.top ?? 0) + u.over.offsetTop;
    const w = tip.offsetWidth;
    const x = left + 16 + w > container.clientWidth ? left - 16 - w : left + 16;
    tip.style.transform = `translate(${Math.max(0, x)}px, ${Math.max(0, top - tip.offsetHeight - 12)}px)`;
  };

  const opts: uPlot.Options = {
    width: Math.max(280, container.clientWidth),
    height,
    padding: [12, o.endLabels ? 132 : 12, 0, 0],
    legend: { show: false },
    cursor: {
      drag: { x: false, y: false },
      points: { size: 9, width: 2, stroke: SURFACE, fill: (u, si) => (u.series[si]!.stroke as () => string)() },
      y: false,
    },
    scales: { x: { time: true } },
    series: [
      {},
      ...o.series.map((s) => ({
        label: s.label,
        stroke: s.color,
        width: 2,
        spanGaps: true,
        points: { show: false },
        fill: o.area && o.series.length === 1
          ? (u: uPlot) => {
              const g = u.ctx.createLinearGradient(0, u.bbox.top, 0, u.bbox.top + u.bbox.height);
              g.addColorStop(0, hexToRgba(s.color, 0.28));
              g.addColorStop(1, hexToRgba(s.color, 0));
              return g;
            }
          : undefined,
      })),
    ],
    axes: [
      { stroke: INK_MUTED, font: FONT, grid: { stroke: GRID, width: 1 }, ticks: { stroke: GRID, width: 1, size: 4 } },
      { stroke: INK_MUTED, font: FONT, grid: { stroke: GRID, width: 1 }, ticks: { show: false }, size: 64, values: (_u, vals) => vals.map((v) => o.yFmt(v)) },
    ],
    hooks: { draw: [baseline, endLabels], setCursor: [setTip] },
  };

  const u = new uPlot(opts, [o.xs, ...o.series.map((s) => s.values)] as uPlot.AlignedData, container);
  const ro = new ResizeObserver(() => u.setSize({ width: Math.max(280, container.clientWidth), height }));
  ro.observe(container);
  u.over.addEventListener('mouseleave', () => (tip.style.opacity = '0'));
  return {
    destroy() {
      ro.disconnect();
      u.destroy();
    },
  };
}

/** A tiny inline SVG sparkline (no axes, no interaction). */
export function sparkline(values: number[], color: string, w = 132, hgt = 40): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(hgt));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('spark');
  if (values.length < 2) return svg;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, hgt - 3 - ((v - min) / span) * (hgt - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const area = document.createElementNS(ns, 'path');
  area.setAttribute('d', `${d}L${pts[pts.length - 1]![0].toFixed(1)} ${hgt}L${pts[0]![0].toFixed(1)} ${hgt}Z`);
  area.setAttribute('fill', hexToRgba(color, 0.14));
  const line = document.createElementNS(ns, 'path');
  line.setAttribute('d', d);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linejoin', 'round');
  line.setAttribute('stroke-linecap', 'round');
  svg.append(area, line);
  return svg;
}
