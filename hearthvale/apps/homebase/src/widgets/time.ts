import { h, icon } from '../dom.ts';
import { bool, num, str, timeString, type WidgetDef } from './types.ts';

const pad = (n: number) => String(n).padStart(2, '0');

export const worldclock: WidgetDef = {
  type: 'worldclock', name: 'World clocks', blurb: 'The time in other cities.', icon: 'globe', defaultSize: 's', sizes: ['s', 'm', 'l'],
  defaults: () => ({ zones: 'New York | America/New_York\nTokyo | Asia/Tokyo\nSydney | Australia/Sydney' }),
  fields: [{ key: 'zones', label: 'Cities (one per line: Name | Time zone)', type: 'textarea', help: 'Time zones look like Europe/London or America/Los_Angeles.' }],
  render(el, ctx) {
    const rows = str(ctx.config.zones).split('\n').map((l) => {
      const [a, b] = l.includes('|') ? l.split('|', 2) : [l.split('/').pop()?.replace(/_/g, ' '), l];
      const tz = (b ?? '').trim();
      try {
        new Intl.DateTimeFormat('en-GB', { timeZone: tz });
        return { label: (a ?? tz).trim(), tz };
      } catch {
        return null;
      }
    }).filter((r): r is { label: string; tz: string } => !!r && !!r.tz);
    const list = h('ul', { class: 'wc-list' });
    el.append(h('h3', { class: 'w-title' }, 'World clocks'), rows.length ? list : h('p', { class: 'muted' }, 'Add cities in settings.'));
    ctx.every(1000, () => {
      const now = new Date();
      const localDay = now.toLocaleDateString('en-CA');
      list.replaceChildren(...rows.map((r) => {
        const day = now.toLocaleDateString('en-CA', { timeZone: r.tz });
        const diff = day > localDay ? 'Tomorrow' : day < localDay ? 'Yesterday' : 'Today';
        return h('li', {}, h('span', { class: 'wc-city' }, r.label, h('small', {}, diff)), h('b', {}, timeString(now, ctx.general, { timeZone: r.tz })));
      }));
    });
  },
};

export const countdown: WidgetDef = {
  type: 'countdown', name: 'Countdown', blurb: 'Days, hours and minutes until something.', icon: 'hourglass', defaultSize: 's', sizes: ['s', 'm'],
  defaults: () => ({ label: 'New Year', target: `${new Date().getFullYear() + 1}-01-01T00:00` }),
  fields: [{ key: 'label', label: 'What’s happening', type: 'text' }, { key: 'target', label: 'When', type: 'datetime' }],
  render(el, ctx) {
    const target = new Date(str(ctx.config.target)).getTime();
    const units = h('div', { class: 'cd-units' });
    el.append(h('h3', { class: 'w-title' }, str(ctx.config.label, 'Countdown')), units);
    if (!Number.isFinite(target)) { units.textContent = 'Set a date in settings.'; return; }
    ctx.every(1000, () => {
      const diff = target - Date.now();
      if (diff <= 0) { units.replaceChildren(h('div', { class: 'cd-done' }, 'It’s here!')); return; }
      const d = Math.floor(diff / 864e5), hr = Math.floor((diff % 864e5) / 36e5), m = Math.floor((diff % 36e5) / 6e4), s = Math.floor((diff % 6e4) / 1e3);
      const u = (v: number, l: string) => h('div', { class: 'cd-unit' }, h('b', {}, l === 'days' ? String(v) : pad(v)), h('span', {}, l));
      units.replaceChildren(u(d, 'days'), u(hr, 'hours'), u(m, 'mins'), u(s, 'secs'));
    });
  },
};

function beep() {
  try {
    const ac = new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.9);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 1);
    o.onended = () => void ac.close();
  } catch {
    /* audio unavailable */
  }
}

export const pomodoro: WidgetDef = {
  type: 'pomodoro', name: 'Focus timer', blurb: 'Pomodoro-style work and break sessions.', icon: 'timer', defaultSize: 's', sizes: ['s', 'm'],
  defaults: () => ({ work: 25, short: 5, long: 15, sound: true }),
  fields: [
    { key: 'work', label: 'Focus minutes', type: 'number', min: 1, max: 180 },
    { key: 'short', label: 'Short break minutes', type: 'number', min: 1, max: 60 },
    { key: 'long', label: 'Long break minutes (every 4th)', type: 'number', min: 1, max: 90 },
    { key: 'sound', label: 'Chime when a session ends', type: 'toggle' },
  ],
  render(el, ctx) {
    const mins = { work: num(ctx.config.work, 25), short: num(ctx.config.short, 5), long: num(ctx.config.long, 15) };
    let mode: 'work' | 'short' | 'long' = 'work', left = mins.work * 60, running = false, done = 0, endAt = 0;
    const R = 52, C = 2 * Math.PI * R;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    svg.classList.add('ring');
    svg.innerHTML = `<circle cx="60" cy="60" r="${R}" class="ring-bg"/><circle cx="60" cy="60" r="${R}" class="ring-fg" stroke-dasharray="${C}" transform="rotate(-90 60 60)"/>`;
    const fg = svg.lastElementChild as SVGCircleElement;
    const label = h('div', { class: 'pomo-time' });
    const modeEl = h('div', { class: 'pomo-mode' });
    const toggle = h('button', { class: 'btn small', type: 'button' });
    const draw = () => {
      label.textContent = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
      modeEl.textContent = mode === 'work' ? `Focus · session ${done + 1}` : mode === 'short' ? 'Short break' : 'Long break';
      fg.setAttribute('stroke-dashoffset', String(C * (1 - left / (mins[mode] * 60))));
      toggle.replaceChildren(icon(running ? 'pause' : 'play'), running ? 'Pause' : 'Start');
    };
    const next = () => {
      if (mode === 'work') { done++; mode = done % 4 === 0 ? 'long' : 'short'; } else mode = 'work';
      left = mins[mode] * 60;
      running = false;
      if (bool(ctx.config.sound, true)) beep();
    };
    toggle.addEventListener('click', () => { running = !running; endAt = Date.now() + left * 1000; draw(); });
    const reset = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Reset', title: 'Reset', onclick: () => { running = false; left = mins[mode] * 60; draw(); } }, icon('reset'));
    const skip = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Skip', title: 'Skip to next', onclick: () => { next(); draw(); } }, icon('right'));
    el.append(h('div', { class: 'pomo' }, h('div', { class: 'ring-wrap' }, svg, h('div', { class: 'ring-label' }, label, modeEl)), h('div', { class: 'row' }, toggle, reset, skip)));
    ctx.every(250, () => {
      if (running) {
        left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
        if (left === 0) next();
      }
      draw();
    });
  },
};

export const stopwatch: WidgetDef = {
  type: 'stopwatch', name: 'Stopwatch', blurb: 'Start, stop and lap.', icon: 'stopwatch', defaultSize: 's', sizes: ['s', 'm'],
  defaults: () => ({}),
  render(el, ctx) {
    let start = 0, acc = 0, running = false;
    const laps: number[] = [];
    const disp = h('div', { class: 'sw-time' });
    const lapList = h('ol', { class: 'sw-laps' });
    const toggle = h('button', { class: 'btn small', type: 'button' });
    const lapBtn = h('button', { class: 'btn small ghost', type: 'button' }, 'Lap');
    const elapsed = () => acc + (running ? performance.now() - start : 0);
    const fmt = (ms: number) => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}.${pad(Math.floor((ms % 1000) / 10))}`;
    const draw = () => {
      disp.textContent = fmt(elapsed());
      toggle.replaceChildren(icon(running ? 'pause' : 'play'), running ? 'Stop' : 'Start');
      lapBtn.textContent = running ? 'Lap' : 'Reset';
    };
    toggle.addEventListener('click', () => { if (running) { acc += performance.now() - start; running = false; } else { start = performance.now(); running = true; } draw(); });
    lapBtn.addEventListener('click', () => {
      if (running) laps.unshift(elapsed()); else { acc = 0; laps.length = 0; }
      lapList.replaceChildren(...laps.slice(0, 5).map((l, i) => h('li', {}, `Lap ${laps.length - i}`, h('b', {}, fmt(l)))));
      draw();
    });
    el.append(h('h3', { class: 'w-title' }, 'Stopwatch'), disp, h('div', { class: 'row' }, toggle, lapBtn), lapList);
    ctx.every(50, () => running && draw());
    draw();
  },
};

export const calendar: WidgetDef = {
  type: 'calendar', name: 'Calendar', blurb: 'This month at a glance.', icon: 'calendar', defaultSize: 's', sizes: ['s', 'm'],
  defaults: () => ({}),
  render(el, ctx) {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth();
    const title = h('h3', { class: 'w-title' });
    const grid = h('div', { class: 'cal-grid', role: 'grid' });
    const monStart = ctx.general.weekStart === 'mon';
    const draw = () => {
      title.textContent = new Date(y, m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const first = new Date(y, m, 1).getDay();
      const offset = monStart ? (first + 6) % 7 : first;
      const days = new Date(y, m + 1, 0).getDate();
      const names = monStart ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      const cells: HTMLElement[] = names.map((n) => h('span', { class: 'cal-head', 'aria-hidden': 'true' }, n));
      for (let i = 0; i < offset; i++) cells.push(h('span', {}));
      for (let d = 1; d <= days; d++) {
        const today = y === now.getFullYear() && m === now.getMonth() && d === now.getDate();
        cells.push(h('span', { class: today ? 'cal-day today' : 'cal-day', 'aria-current': today ? 'date' : undefined }, String(d)));
      }
      grid.replaceChildren(...cells);
    };
    const nav = (dir: number) => { m += dir; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } draw(); };
    el.append(h('div', { class: 'w-head' }, title, h('div', { class: 'row' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous month', onclick: () => nav(-1) }, icon('left')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next month', onclick: () => nav(1) }, icon('right')))), grid);
    draw();
  },
};

export const progress: WidgetDef = {
  type: 'progress', name: 'Time progress', blurb: 'How far through the day, week, month and year you are.', icon: 'progress', defaultSize: 's', sizes: ['s', 'm'],
  defaults: () => ({}),
  render(el, ctx) {
    const list = h('div', { class: 'prog-list' });
    el.append(h('h3', { class: 'w-title' }, 'Progress'), list);
    ctx.every(30_000, () => {
      const n = new Date();
      const dayStart = new Date(n.getFullYear(), n.getMonth(), n.getDate());
      const dow = ctx.general.weekStart === 'mon' ? (n.getDay() + 6) % 7 : n.getDay();
      const weekStart = new Date(dayStart.getTime() - dow * 864e5);
      const monthStart = new Date(n.getFullYear(), n.getMonth(), 1), monthEnd = new Date(n.getFullYear(), n.getMonth() + 1, 1);
      const yearStart = new Date(n.getFullYear(), 0, 1), yearEnd = new Date(n.getFullYear() + 1, 0, 1);
      const f = (a: Date, b: number) => (n.getTime() - a.getTime()) / b;
      const rows: [string, number][] = [
        ['Day', f(dayStart, 864e5)], ['Week', f(weekStart, 7 * 864e5)],
        ['Month', f(monthStart, monthEnd.getTime() - monthStart.getTime())], ['Year', f(yearStart, yearEnd.getTime() - yearStart.getTime())],
      ];
      list.replaceChildren(...rows.map(([l, v]) => h('div', { class: 'prog' }, h('span', {}, l),
        h('div', { class: 'bar', role: 'progressbar', 'aria-label': `${l} progress`, 'aria-valuenow': Math.round(v * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: `width:${(v * 100).toFixed(1)}%` })),
        h('b', {}, `${Math.floor(v * 100)}%`))));
    });
  },
};

const SYNODIC = 29.530588853;
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14) / 864e5;
function moonPhase(date: Date) {
  const days = date.getTime() / 864e5 - NEW_MOON_REF;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const frac = age / SYNODIC;
  const illum = (1 - Math.cos(2 * Math.PI * frac)) / 2;
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return { age, frac, illum, name: names[Math.round(frac * 8) % 8]! };
}

export const moon: WidgetDef = {
  type: 'moon', name: 'Moon phase', blurb: 'Tonight’s moon, and when it’s next full.', icon: 'moon', defaultSize: 's', sizes: ['s', 'm'],
  defaults: () => ({}),
  render(el) {
    const p = moonPhase(new Date());
    // Lit part: a half-disc plus an ellipse whose width follows the phase.
    const k = Math.cos(2 * Math.PI * p.frac);
    const waxing = p.frac < 0.5;
    const rx = Math.abs(k) * 40;
    const sweepHalf = waxing ? 1 : 0;
    const sweepEll = (waxing ? k > 0 : k < 0) ? 0 : 1;
    const path = `M50 10 A40 40 0 0 ${sweepHalf} 50 90 A${rx} 40 0 0 ${sweepEll} 50 10Z`;
    const toFull = ((0.5 - p.frac + 1) % 1) * SYNODIC;
    const nextFull = new Date(Date.now() + toFull * 864e5);
    const svg = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="moon" role="img" aria-label="${p.name}"><circle cx="50" cy="50" r="40" class="moon-dark"/><path d="${path}" class="moon-lit"/></svg>`, 'image/svg+xml').documentElement;
    el.append(h('div', { class: 'moon-row' }, document.importNode(svg, true), h('div', {},
      h('h3', { class: 'w-title' }, p.name), h('div', {}, `${Math.round(p.illum * 100)}% lit`),
      h('div', { class: 'muted small' }, `Next full moon ${nextFull.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`))));
  },
};

const PATTERNS: Record<string, { label: string; steps: [string, number][] }> = {
  box: { label: 'Box breathing (4-4-4-4)', steps: [['Breathe in', 4], ['Hold', 4], ['Breathe out', 4], ['Hold', 4]] },
  relax: { label: '4-7-8 relaxing breath', steps: [['Breathe in', 4], ['Hold', 7], ['Breathe out', 8]] },
  calm: { label: 'Calm (4 in, 6 out)', steps: [['Breathe in', 4], ['Breathe out', 6]] },
};

export const breathe: WidgetDef = {
  type: 'breathe', name: 'Breathe', blurb: 'A guided breathing exercise to reset.', icon: 'wind', defaultSize: 's', sizes: ['s', 'm'],
  defaults: () => ({ pattern: 'box' }),
  fields: [{ key: 'pattern', label: 'Pattern', type: 'select', options: Object.entries(PATTERNS).map(([value, p]) => ({ value, label: p.label })) }],
  render(el, ctx) {
    const pat = PATTERNS[str(ctx.config.pattern, 'box')] ?? PATTERNS.box!;
    const circle = h('div', { class: 'breath-circle' });
    const label = h('div', { class: 'breath-label', 'aria-live': 'polite' }, 'Ready');
    const btn = h('button', { class: 'btn small', type: 'button' }, icon('play'), 'Start');
    let timer = 0, i = 0, running = false;
    const step = () => {
      const [name, secs] = pat.steps[i % pat.steps.length]!;
      label.textContent = `${name} · ${secs}`;
      circle.style.transitionDuration = `${secs}s`;
      if (name.startsWith('Breathe in')) circle.classList.add('big');
      if (name.startsWith('Breathe out')) circle.classList.remove('big');
      i++;
      timer = window.setTimeout(step, secs * 1000);
    };
    btn.addEventListener('click', () => {
      running = !running;
      clearTimeout(timer);
      if (running) { i = 0; step(); } else { circle.classList.remove('big'); label.textContent = 'Ready'; }
      btn.replaceChildren(icon(running ? 'pause' : 'play'), running ? 'Stop' : 'Start');
    });
    ctx.onCleanup(() => clearTimeout(timer));
    el.append(h('h3', { class: 'w-title' }, 'Breathe'), h('div', { class: 'breath' }, circle, label), btn);
  },
};
