import '@fontsource-variable/inter';
import './styles.css';
import { download, h, store, topBar } from './dom.ts';
import { NOTES, PRESETS, STEPS, decode, encode, type Pattern } from './pattern.ts';
import { DRUMS, ROOTS, SCALES, bass, drum, master, wav, type Scale } from './sound.ts';

const KEY = 'loopline.v1';
const fromHash = () => decode(new URLSearchParams(location.hash.slice(1)).get('p') ?? '');
let p: Pattern = fromHash() ?? decode(store.get<string>(KEY) ?? '') ?? PRESETS[0]!.make();

// ---------------------------------------------------------------- audio

let ac: AudioContext | null = null;
let out: GainNode;
let playing = false;
let nextTime = 0;
let nextStep = 0;
let timer = 0;
const queue: { step: number; t: number }[] = [];

const stepDur = () => 60 / p.bpm / 4;

function audio(): AudioContext {
  if (!ac) {
    ac = new AudioContext({ latencyHint: 'interactive' });
    out = master(ac);
  }
  void ac.resume();
  return ac;
}

/** Plays everything on step `i` at time `t`. Odd steps are pushed late by the swing amount. */
function playStep(ctx: BaseAudioContext, dest: AudioNode, i: number, t: number) {
  const at = t + (i % 2 ? (stepDur() * p.swing) / 150 : 0);
  DRUMS.forEach((d, k) => p.drums[d.id][i] && drum(ctx, dest, d.id, at, p.vols[k]! / 9));
  if (p.bass[i]! >= 0) bass(ctx, dest, at, stepDur() * 0.95, p.root, p.scale, p.bass[i]!, p.vols[6]! / 9);
}

// A look-ahead scheduler: a coarse timer queues notes slightly ahead on the precise audio clock.
function schedule() {
  const ctx = ac!;
  while (nextTime < ctx.currentTime + 0.12) {
    playStep(ctx, out, nextStep, nextTime);
    queue.push({ step: nextStep, t: nextTime });
    nextTime += stepDur();
    nextStep = (nextStep + 1) % STEPS;
  }
}

function setPlaying(on: boolean) {
  if (on === playing) return;
  playing = on;
  playBtn.textContent = on ? 'Stop' : 'Play';
  playBtn.setAttribute('aria-pressed', String(on));
  if (on) {
    const ctx = audio();
    nextStep = 0;
    nextTime = ctx.currentTime + 0.05;
    queue.length = 0;
    timer = window.setInterval(schedule, 25);
    schedule();
    requestAnimationFrame(drawPlayhead);
  } else {
    clearInterval(timer);
    showStep(-1);
  }
}

let shown = -1;
function drawPlayhead() {
  if (!playing || !ac) return;
  while (queue.length > 1 && queue[1]!.t <= ac.currentTime) queue.shift();
  if (queue[0] && queue[0].t <= ac.currentTime) showStep(queue[0].step);
  requestAnimationFrame(drawPlayhead);
}

function showStep(i: number) {
  if (i === shown) return;
  for (const el of document.querySelectorAll(`[data-col="${shown}"]`)) el.classList.remove('now');
  for (const el of document.querySelectorAll(`[data-col="${i}"]`)) el.classList.add('now');
  shown = i;
}

async function exportWav() {
  const loops = 4;
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(rate * (stepDur() * STEPS * loops + 1)), rate);
  const dest = master(ctx);
  for (let n = 0; n < STEPS * loops; n++) playStep(ctx, dest, n % STEPS, n * stepDur());
  toast('Rendering…');
  download(wav(await ctx.startRendering()), `loopline-${p.bpm}bpm.wav`);
  toast('Saved four loops as a WAV file.');
}

// ---------------------------------------------------------------- UI

const toastEl = h('div', { class: 'toast', role: 'status' });
let toastTimer = 0;
function toast(text: string) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2600);
}

let saveTimer = 0;
function changed() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => store.set(KEY, encode(p)), 300);
  if (location.hash) history.replaceState(null, '', location.pathname); // the link no longer matches
}

const playBtn = h('button', { class: 'play', type: 'button', 'aria-pressed': 'false', onclick: () => setPlaying(!playing) }, 'Play');

function range(label: string, min: number, max: number, get: () => number, set: (n: number) => void, unit = '') {
  const out = h('output', {}, `${get()}${unit}`);
  const input = h('input', { type: 'range', min, max, value: get(), 'aria-label': label });
  input.addEventListener('input', () => {
    set(Number(input.value));
    out.textContent = `${input.value}${unit}`;
    changed();
  });
  return h('label', { class: 'ctl' }, h('span', {}, label), input, out);
}

function select<T extends string | number>(label: string, options: [T, string][], get: () => T, set: (v: T) => void) {
  const el = h('select', { 'aria-label': label }, options.map(([v, text]) => h('option', { value: String(v), selected: v === get() }, text)));
  el.addEventListener('change', () => {
    const v = options.find(([o]) => String(o) === el.value)![0];
    set(v);
    changed();
  });
  return h('label', { class: 'ctl' }, h('span', {}, label), el);
}

function stepButton(label: string, on: boolean, col: number, onclick: (b: HTMLButtonElement) => void) {
  const b = h('button', { type: 'button', class: `cell${col % 4 === 0 ? ' beat' : ''}`, 'data-col': col, 'aria-pressed': String(on), 'aria-label': label });
  b.addEventListener('click', () => onclick(b));
  return b;
}

function grid(): HTMLElement {
  const drums = DRUMS.map((d, k) => h('div', { class: `row drum-${d.id}` },
    h('div', { class: 'name' }, h('span', {}, d.name), volume(k, d.name)),
    Array.from({ length: STEPS }, (_, i) => stepButton(`${d.name}, step ${i + 1}`, p.drums[d.id][i]!, i, (b) => {
      const on = (p.drums[d.id][i] = !p.drums[d.id][i]);
      b.setAttribute('aria-pressed', String(on));
      if (on && !playing) drum(audio(), out, d.id, ac!.currentTime, p.vols[k]! / 9);
      changed();
    }))));
  const deg = SCALES[p.scale];
  const notes = Array.from({ length: NOTES }, (_, r) => NOTES - 1 - r).map((n) => h('div', { class: 'row bass' },
    h('div', { class: 'name' }, h('span', {}, ROOTS[(p.root + deg[n]!) % 12])),
    Array.from({ length: STEPS }, (_, i) => stepButton(`Bass ${ROOTS[(p.root + deg[n]!) % 12]}, step ${i + 1}`, p.bass[i] === n, i, () => {
      p.bass[i] = p.bass[i] === n ? -1 : n;
      for (const b of document.querySelectorAll<HTMLButtonElement>(`.bass [data-col="${i}"]`)) b.setAttribute('aria-pressed', 'false');
      if (p.bass[i] === n) {
        document.querySelector(`.bass[data-deg="${n}"] [data-col="${i}"]`)?.setAttribute('aria-pressed', 'true');
        if (!playing) bass(audio(), out, ac!.currentTime, 0.25, p.root, p.scale, n, p.vols[6]! / 9);
      }
      changed();
    }))));
  notes.forEach((row, r) => row.setAttribute('data-deg', String(NOTES - 1 - r)));
  return h('div', { class: 'grids' },
    h('section', { class: 'grid', 'aria-label': 'Drums' }, h('h2', {}, 'Drums'), drums),
    h('section', { class: 'grid', 'aria-label': 'Bass' }, h('h2', {}, 'Bass ', volume(6, 'Bass')), notes));
}

function volume(k: number, name: string) {
  const v = h('input', { type: 'range', class: 'vol', min: 0, max: 9, value: p.vols[k], 'aria-label': `${name} volume` });
  v.addEventListener('input', () => {
    p.vols[k] = Number(v.value);
    changed();
  });
  return v;
}

const gridHost = h('div', {});
const controlsHost = h('div', { class: 'controls' });

function render() {
  controlsHost.replaceChildren(
    playBtn,
    range('Tempo', 60, 200, () => p.bpm, (n) => (p.bpm = n), ' bpm'),
    range('Swing', 0, 60, () => p.swing, (n) => (p.swing = n), '%'),
    select('Key', ROOTS.map((r, i) => [i, r] as [number, string]), () => p.root, (v) => ((p.root = v), render())),
    select('Scale', (Object.keys(SCALES) as Scale[]).map((s) => [s, s[0]!.toUpperCase() + s.slice(1)] as [Scale, string]), () => p.scale, (v) => ((p.scale = v), render())),
    h('div', { class: 'actions' },
      h('label', { class: 'ctl' }, h('span', {}, 'Start from'), presetMenu()),
      h('button', { type: 'button', onclick: share }, 'Share link'),
      h('button', { type: 'button', onclick: () => void exportWav() }, 'Export WAV')),
  );
  gridHost.replaceChildren(grid());
  if (playing) shown = -1;
}

function presetMenu() {
  const el = h('select', { 'aria-label': 'Start from a preset' }, h('option', { value: '' }, 'Choose a preset…'), PRESETS.map((x, i) => h('option', { value: i }, x.name)));
  el.addEventListener('change', () => {
    if (el.value === '') return;
    p = PRESETS[Number(el.value)]!.make();
    changed();
    render();
  });
  return el;
}

async function share() {
  const url = `${location.origin}${location.pathname}#p=${encode(p)}`;
  try {
    // Phones get the share sheet; desktops just copy, which is what people expect there.
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'My Loopline beat', url });
    else {
      await navigator.clipboard.writeText(url);
      toast('Link copied. Anyone who opens it hears your loop.');
    }
  } catch {
    /* cancelled */
  }
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    setPlaying(!playing);
  }
});
document.addEventListener('visibilitychange', () => document.hidden && setPlaying(false));
window.addEventListener('hashchange', () => {
  const shared = fromHash();
  if (shared) {
    p = shared;
    render();
  }
});

document.getElementById('app')!.replaceChildren(
  topBar('Loopline', 'creative-tools'),
  h('main', {},
    h('p', { class: 'intro' }, 'Tap the grid to build a beat, then press Play (or Space). Every sound is made live in your browser.'),
    controlsHost,
    gridHost),
  toastEl,
);
render();
