import '@fontsource-variable/inter';
import './styles.css';
import { h, topBar } from './dom.ts';
import { PRESETS, body, centreOfMass, step, type Body } from './physics.ts';

const KINDS = [
  { name: 'Asteroid', m: 0.5, color: '#b9b2a8' },
  { name: 'Moon', m: 3, color: '#d9d9d9' },
  { name: 'Planet', m: 12, color: '#5fa8ff' },
  { name: 'Gas giant', m: 70, color: '#e8a86b' },
  { name: 'Star', m: 1500, color: '#ffc35a' },
];
const DT = 0.05;
const TRAIL = 140;
const LAUNCH = 0.03; // launch speed per screen pixel of pull

let bodies: Body[] = PRESETS[0]!.make();
const trails = new WeakMap<Body, number[]>();
let running = true;
let speed = 1;
let kind = 2;
let showTrails = true;
let follow = true;
let simTime = 0;
const cam = { x: 0, y: 0, zoom: 1.4 };

const canvas = h('canvas', { class: 'sky', role: 'img', 'aria-label': 'Gravity simulation' });
const ctx = canvas.getContext('2d')!;
let W = 0;
let H = 0;
let dpr = 1;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
}

const toScreen = (x: number, y: number) => [(x - cam.x) * cam.zoom + W / 2, (y - cam.y) * cam.zoom + H / 2] as const;
const toWorld = (sx: number, sy: number) => [(sx - W / 2) / cam.zoom + cam.x, (sy - H / 2) / cam.zoom + cam.y] as const;

// Background stars, fixed to the screen
const stars = Array.from({ length: 160 }, () => [Math.random(), Math.random(), Math.random() * 1.2 + 0.2] as const);

function frame() {
  if (running) {
    const n = Math.round(8 * speed);
    for (let i = 0; i < n; i++) bodies = step(bodies, DT);
    simTime += n * DT;
    const c = centreOfMass(bodies);
    bodies = bodies.filter((b) => Math.hypot(b.x - c.x, b.y - c.y) < 6000); // escaped bodies leave
    for (const b of bodies) {
      let t = trails.get(b);
      if (!t) trails.set(b, (t = []));
      t.push(b.x, b.y);
      if (t.length > TRAIL * 2) t.splice(0, 2);
    }
  }
  if (follow && bodies.length) {
    const c = centreOfMass(bodies);
    cam.x += (c.x - cam.x) * 0.1;
    cam.y += (c.y - cam.y) * 0.1;
  }
  draw();
  stats.textContent = `${bodies.length} ${bodies.length === 1 ? 'body' : 'bodies'} · time ${Math.floor(simTime)}`;
  requestAnimationFrame(frame);
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const [x, y, r] of stars) ctx.fillRect(x * W, y * H, r, r);

  if (showTrails) {
    ctx.lineWidth = 1.2;
    for (const b of bodies) {
      const t = trails.get(b);
      if (!t || t.length < 4 || b.m < 0.1) continue;
      ctx.strokeStyle = b.color + '66';
      ctx.beginPath();
      for (let i = 0; i < t.length; i += 2) {
        const [sx, sy] = toScreen(t[i]!, t[i + 1]!);
        if (i) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
      }
      ctx.stroke();
    }
  }
  for (const b of bodies) {
    const [sx, sy] = toScreen(b.x, b.y);
    const r = Math.max(b.m < 0.1 ? 1 : 1.5, b.r * cam.zoom);
    if (b.m >= 500) {
      const g = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 4);
      g.addColorStop(0, b.color + '88');
      g.addColorStop(1, b.color + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (aim) {
    const [sx, sy] = toScreen(aim.x, aim.y);
    ctx.strokeStyle = '#ffffffaa';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(aim.px, aim.py);
    ctx.stroke();
    ctx.setLineDash([]);
    // Arrow shows where it will fly: opposite the pull, like a slingshot.
    ctx.strokeStyle = KINDS[kind]!.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (sx - aim.px), sy + (sy - aim.py));
    ctx.stroke();
    ctx.fillStyle = KINDS[kind]!.color;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(2, 1.5 * Math.cbrt(KINDS[kind]!.m) * cam.zoom), 0, Math.PI * 2);
    ctx.fill();
  }
}

// Press to place, pull back and let go to launch.
let aim: { x: number; y: number; px: number; py: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  const [x, y] = toWorld(e.clientX - r.left, e.clientY - r.top);
  aim = { x, y, px: e.clientX - r.left, py: e.clientY - r.top };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!aim) return;
  const r = canvas.getBoundingClientRect();
  aim.px = e.clientX - r.left;
  aim.py = e.clientY - r.top;
});
canvas.addEventListener('pointerup', () => {
  if (!aim) return;
  const [sx, sy] = toScreen(aim.x, aim.y);
  const k = KINDS[kind]!;
  // Velocity is relative to the whole system's drift, so launches feel the same while the camera follows it.
  const mass = bodies.reduce((m, b) => m + b.m, 0) || 1;
  const vx = bodies.reduce((v, b) => v + b.vx * b.m, 0) / mass;
  const vy = bodies.reduce((v, b) => v + b.vy * b.m, 0) / mass;
  bodies.push(body(aim.x, aim.y, (sx - aim.px) * LAUNCH + vx, (sy - aim.py) * LAUNCH + vy, k.m, k.color));
  aim = null;
  if (bodies.length > 400) bodies.splice(1, 1);
});
canvas.addEventListener('pointercancel', () => (aim = null));
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
}, { passive: false });

const zoomBy = (f: number) => (cam.zoom = Math.min(8, Math.max(0.15, cam.zoom * f)));

function load(i: number) {
  bodies = PRESETS[i]!.make();
  simTime = 0;
  const c = centreOfMass(bodies);
  Object.assign(cam, c, { zoom: i === 3 ? 0.9 : 1.4 });
}

// ---------------------------------------------------------------- controls

const stats = h('span', { class: 'stats', 'aria-live': 'off' });
const pauseBtn = h('button', { type: 'button', class: 'primary', onclick: () => setRunning(!running) }, 'Pause');
function setRunning(on: boolean) {
  running = on;
  pauseBtn.textContent = on ? 'Pause' : 'Play';
}
const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) => {
  const input = h('input', { type: 'checkbox', checked: get() });
  input.addEventListener('change', () => set(input.checked));
  return h('label', { class: 'check' }, input, ` ${label}`);
};
const speedInput = h('select', { 'aria-label': 'Speed' }, [0.25, 0.5, 1, 2, 4].map((s) => h('option', { value: s, selected: s === 1 }, `${s}×`)));
speedInput.addEventListener('change', () => (speed = Number(speedInput.value)));
const presetMenu = h('select', { 'aria-label': 'Scene' }, PRESETS.map((p, i) => h('option', { value: i }, p.name)));
presetMenu.addEventListener('change', () => load(Number(presetMenu.value)));
const kindBtns = KINDS.map((k, i) => h('button', { type: 'button', class: 'kind', role: 'radio', 'aria-checked': String(i === kind), style: `--c:${k.color}`, onclick: () => {
  kind = i;
  kindBtns.forEach((b, j) => b.setAttribute('aria-checked', String(j === i)));
} }, k.name));

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    setRunning(!running);
  }
});

document.getElementById('app')!.replaceChildren(
  topBar('Orbit Lab', 'creative-tools', stats),
  h('main', {},
    canvas,
    h('div', { class: 'hud' },
      h('div', { class: 'group' }, pauseBtn, h('label', { class: 'ctl' }, 'Speed ', speedInput), h('label', { class: 'ctl' }, 'Scene ', presetMenu),
        h('button', { type: 'button', onclick: () => load(Number(presetMenu.value)) }, 'Restart')),
      h('div', { class: 'group', role: 'radiogroup', 'aria-label': 'What to launch' }, h('span', { class: 'lbl' }, 'Launch'), kindBtns),
      h('div', { class: 'group' },
        h('button', { type: 'button', 'aria-label': 'Zoom in', onclick: () => zoomBy(1.3) }, '+'),
        h('button', { type: 'button', 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 1.3) }, '−'),
        toggle('Follow', () => follow, (v) => (follow = v)),
        toggle('Trails', () => showTrails, (v) => (showTrails = v))),
      h('p', { class: 'hint' }, 'Press on space, pull back and let go to launch. Pull further to throw harder. Bodies that touch merge.'))),
);
new ResizeObserver(resize).observe(canvas);
resize();
load(0);
requestAnimationFrame(frame);
