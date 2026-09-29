import * as L from 'lucide';

type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
export type Child = Node | string | number | null | undefined | false;

/** Tiny hyperscript helper. Text children are always inserted as text, never as HTML. */
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

const ICONS = {
  settings: L.Settings2, palette: L.Palette, pencil: L.Pencil, check: L.Check, plus: L.Plus, close: L.X, trash: L.Trash2,
  grip: L.GripVertical, left: L.ChevronLeft, right: L.ChevronRight, up: L.ArrowUp, down: L.ArrowDown, search: L.Search,
  clock: L.Clock, hand: L.Hand, link: L.Link, cloud: L.Cloud, sun: L.Sun, moon: L.Moon, globe: L.Globe, hourglass: L.Hourglass,
  note: L.StickyNote, list: L.ListTodo, timer: L.Timer, calendar: L.CalendarDays, quote: L.Quote, calc: L.Calculator,
  currency: L.ArrowLeftRight, chart: L.ChartLine, progress: L.ChartNoAxesColumn, stopwatch: L.AlarmClock, wind: L.Wind,
  image: L.Image, play: L.Play, pause: L.Pause, reset: L.RotateCcw, resize: L.Scaling, help: L.CircleHelp, download: L.Download,
  upload: L.Upload, copy: L.Copy, sparkles: L.Sparkles, eye: L.Eye, drop: L.Droplets, snow: L.Snowflake, rain: L.CloudRain,
  bolt: L.CloudLightning, fog: L.CloudFog, sunCloud: L.CloudSun, external: L.ExternalLink, monitor: L.Monitor, phone: L.Smartphone,
} as const;
export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size = '1em'): SVGElement {
  const svg = L.createElement(ICONS[name]);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  return svg;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

/** Clamp to a range. */
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** "#rrggbb" → [r, g, b] in 0..1. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? Number.parseInt(m[1]!, 16) : 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}

/** WCAG relative luminance of a hex colour. */
export function luminance(hex: string): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = hexToRgb(hex).map(lin) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
