import '@fontsource-variable/inter';
import './styles.css';
import { download, h, store, topBar } from './dom.ts';
import { PALETTES, SIZES, blankFrame, colorToHex, fill, hexToColor, line, newDoc, rect, validDoc, type Doc } from './doc.ts';

const KEY = 'pixelforge.v1';
const TOOLS = [
  { id: 'pencil', name: 'Pencil', key: 'b' },
  { id: 'eraser', name: 'Eraser', key: 'e' },
  { id: 'fill', name: 'Fill', key: 'g' },
  { id: 'line', name: 'Line', key: 'l' },
  { id: 'rect', name: 'Rectangle', key: 'r' },
  { id: 'picker', name: 'Pick colour', key: 'i' },
] as const;
type Tool = (typeof TOOLS)[number]['id'];

let doc: Doc = validDoc(store.get(KEY)) ?? newDoc();
let cur = 0; // frame index
let tool: Tool = 'pencil';
let color = hexToColor('#ef7d57');
let palette = 'Sweetie 16';
let mirror = false;
let onion = true;
const undo: { frame: number; px: number[] }[] = [];
const redo: typeof undo = [];

const frame = () => doc.frames[cur]!;

// ---------------------------------------------------------------- rendering

const canvas = h('canvas', { class: 'board', role: 'img', 'aria-label': 'Drawing canvas' });
const ctx = canvas.getContext('2d')!;
const scratch = document.createElement('canvas');
let zoom = 16;

/** Draws a frame's pixels onto a canvas at 1:1. */
function paint(target: HTMLCanvasElement, px: number[]) {
  target.width = doc.w;
  target.height = doc.h;
  const img = new ImageData(doc.w, doc.h);
  px.forEach((c, i) => {
    img.data[i * 4] = c >>> 24;
    img.data[i * 4 + 1] = (c >>> 16) & 255;
    img.data[i * 4 + 2] = (c >>> 8) & 255;
    img.data[i * 4 + 3] = c & 255;
  });
  target.getContext('2d')!.putImageData(img, 0, 0);
}

function fit() {
  const room = Math.min(stage.clientWidth - 8, Math.max(260, window.innerHeight - 260));
  zoom = Math.max(4, Math.floor(room / Math.max(doc.w, doc.h)));
  canvas.width = doc.w * zoom;
  canvas.height = doc.h * zoom;
  draw();
}

function draw(px = frame()) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (onion && cur > 0) {
    paint(scratch, doc.frames[cur - 1]!);
    ctx.globalAlpha = 0.25;
    ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }
  paint(scratch, px);
  ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height);
  if (zoom >= 8) {
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    for (let x = 1; x < doc.w; x++) ctx.moveTo(x * zoom + 0.5, 0), ctx.lineTo(x * zoom + 0.5, canvas.height);
    for (let y = 1; y < doc.h; y++) ctx.moveTo(0, y * zoom + 0.5), ctx.lineTo(canvas.width, y * zoom + 0.5);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- drawing

let stroke: { base: number[]; x0: number; y0: number; last: [number, number] } | null = null;

function cell(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [Math.floor(((e.clientX - r.left) / r.width) * doc.w), Math.floor(((e.clientY - r.top) / r.height) * doc.h)];
}

function plot(px: number[], cells: [number, number][], c: number) {
  for (const [x, y] of cells) {
    for (const xx of mirror ? [x, doc.w - 1 - x] : [x]) if (xx >= 0 && y >= 0 && xx < doc.w && y < doc.h) px[y * doc.w + xx] = c;
  }
}

canvas.addEventListener('pointerdown', (e) => {
  const [x, y] = cell(e);
  if (tool === 'picker') {
    const c = frame()[y * doc.w + x];
    if (c) setColor(c);
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  undo.push({ frame: cur, px: [...frame()] });
  if (undo.length > 100) undo.shift();
  redo.length = 0;
  if (tool === 'fill') {
    fill(frame(), doc.w, doc.h, x, y, color);
    if (mirror) fill(frame(), doc.w, doc.h, doc.w - 1 - x, y, color);
    return commit();
  }
  stroke = { base: [...frame()], x0: x, y0: y, last: [x, y] };
  move(x, y);
});

canvas.addEventListener('pointermove', (e) => stroke && move(...cell(e)));
canvas.addEventListener('pointerup', () => stroke && ((stroke = null), commit()));
canvas.addEventListener('pointercancel', () => stroke && ((stroke = null), commit()));

function move(x: number, y: number) {
  const s = stroke!;
  const c = tool === 'eraser' ? 0 : color;
  if (tool === 'pencil' || tool === 'eraser') {
    plot(frame(), line(s.last[0], s.last[1], x, y), c);
    s.last = [x, y];
  } else {
    // Shapes redraw from the stroke's starting copy, so dragging previews the shape.
    doc.frames[cur] = [...s.base];
    plot(frame(), tool === 'line' ? line(s.x0, s.y0, x, y) : rect(s.x0, s.y0, x, y), c);
  }
  draw();
}

let saveTimer = 0;
function commit() {
  draw();
  renderFrames();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (!store.set(KEY, doc)) toast('Couldn’t save: your browser’s storage is full or blocked.');
  }, 400);
}

function history(from: typeof undo, to: typeof undo) {
  const step = from.pop();
  if (!step || !doc.frames[step.frame]) return;
  to.push({ frame: step.frame, px: [...doc.frames[step.frame]!] });
  doc.frames[step.frame] = step.px;
  cur = step.frame;
  commit();
}

// ---------------------------------------------------------------- side panels

const toolBar = h('div', { class: 'tools', role: 'toolbar', 'aria-label': 'Tools' });
function renderTools() {
  toolBar.replaceChildren(
    ...TOOLS.map((t) => h('button', { type: 'button', class: 'tool', 'aria-pressed': String(t.id === tool), title: `${t.name} (${t.key.toUpperCase()})`, onclick: () => setTool(t.id) }, t.name)),
    h('button', { type: 'button', class: 'tool', 'aria-pressed': String(mirror), title: 'Mirror left and right (M)', onclick: () => ((mirror = !mirror), renderTools()) }, 'Mirror'),
    h('button', { type: 'button', class: 'tool', title: 'Undo (Ctrl+Z)', onclick: () => history(undo, redo) }, 'Undo'),
    h('button', { type: 'button', class: 'tool', title: 'Redo (Ctrl+Y)', onclick: () => history(redo, undo) }, 'Redo'),
  );
}
const setTool = (t: Tool) => ((tool = t), renderTools());

const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Palette' });
const picker = h('input', { type: 'color', 'aria-label': 'Custom colour' });
function renderPalette() {
  picker.value = colorToHex(color);
  swatches.replaceChildren(...PALETTES[palette]!.map((hex) => h('button', {
    type: 'button', class: 'swatch', role: 'radio', style: `--c:${hex}`, 'aria-label': hex, 'aria-checked': String(hexToColor(hex) === color),
    onclick: () => setColor(hexToColor(hex)),
  })));
}
function setColor(c: number) {
  color = c;
  if (tool === 'picker' || tool === 'eraser') tool = 'pencil';
  renderTools();
  renderPalette();
}
picker.addEventListener('input', () => setColor(hexToColor(picker.value)));
const paletteMenu = h('select', { 'aria-label': 'Palette' }, Object.keys(PALETTES).map((n) => h('option', { selected: n === palette }, n)));
paletteMenu.addEventListener('change', () => ((palette = paletteMenu.value), renderPalette()));

const frameList = h('div', { class: 'frames', role: 'listbox', 'aria-label': 'Frames' });
function renderFrames() {
  frameList.replaceChildren(...doc.frames.map((px, i) => {
    const thumb = document.createElement('canvas');
    paint(thumb, px);
    return h('button', { type: 'button', class: 'frame', role: 'option', 'aria-selected': String(i === cur), 'aria-label': `Frame ${i + 1}`, onclick: () => ((cur = i), draw(), renderFrames()) }, thumb, h('span', {}, String(i + 1)));
  }));
}
function addFrame(copy: boolean) {
  if (doc.frames.length >= 64) return toast('That’s the 64-frame limit.');
  doc.frames.splice(cur + 1, 0, copy ? [...frame()] : blankFrame(doc.w, doc.h));
  cur++;
  undo.length = redo.length = 0;
  commit();
}
function deleteFrame() {
  if (doc.frames.length === 1) return toast('A drawing needs at least one frame.');
  if (frame().some((c) => c) && !confirm(`Delete frame ${cur + 1}?`)) return;
  doc.frames.splice(cur, 1);
  cur = Math.min(cur, doc.frames.length - 1);
  undo.length = redo.length = 0;
  commit();
}

// Animation preview
const preview = h('canvas', { class: 'preview', role: 'img', 'aria-label': 'Animation preview' });
let previewAt = 0;
let last = 0;
function animate(t: number) {
  if (t - last >= 1000 / doc.fps) {
    last = t;
    previewAt = (previewAt + 1) % doc.frames.length;
    paint(preview, doc.frames[previewAt] ?? frame());
  }
  requestAnimationFrame(animate);
}
const fpsInput = h('input', { type: 'range', min: 1, max: 24, value: doc.fps, 'aria-label': 'Frames per second' });
const fpsOut = h('output', {}, `${doc.fps} fps`);
fpsInput.addEventListener('input', () => {
  doc.fps = Number(fpsInput.value);
  fpsOut.textContent = `${doc.fps} fps`;
  commit();
});

// ---------------------------------------------------------------- export, new

const scaleMenu = h('select', { 'aria-label': 'Export scale' }, [1, 2, 4, 8, 16].map((s) => h('option', { value: s, selected: s === 8 }, `×${s}`)));
function exportPng(sheet: boolean) {
  const s = Number(scaleMenu.value);
  const list = sheet ? doc.frames : [frame()];
  const out = document.createElement('canvas');
  out.width = doc.w * s * list.length;
  out.height = doc.h * s;
  const o = out.getContext('2d')!;
  o.imageSmoothingEnabled = false;
  list.forEach((px, i) => {
    paint(scratch, px);
    o.drawImage(scratch, i * doc.w * s, 0, doc.w * s, doc.h * s);
  });
  out.toBlob((b) => b && download(b, sheet ? `pixelforge-sheet-${list.length}f.png` : `pixelforge-frame${cur + 1}.png`), 'image/png');
}

const sizeMenu = h('select', { 'aria-label': 'Canvas size' }, SIZES.map((s) => h('option', { value: s, selected: s === doc.w }, `${s}×${s}`)));
function newDrawing() {
  if (doc.frames.some((f) => f.some((c) => c)) && !confirm('Start a new drawing? This one will be lost unless you’ve exported it.')) {
    sizeMenu.value = String(doc.w);
    return;
  }
  doc = newDoc(Number(sizeMenu.value));
  cur = 0;
  undo.length = redo.length = 0;
  fpsInput.value = String(doc.fps);
  fit();
  commit();
}
sizeMenu.addEventListener('change', newDrawing);

const onionBox = h('input', { type: 'checkbox', checked: onion });
onionBox.addEventListener('change', () => ((onion = onionBox.checked), draw()));

const toastEl = h('div', { class: 'toast', role: 'status' });
let toastTimer = 0;
function toast(text: string) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2600);
}

document.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, select')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') return e.preventDefault(), history(...(e.shiftKey ? [redo, undo] : [undo, redo]) as [typeof undo, typeof undo]);
  if ((e.ctrlKey || e.metaKey) && k === 'y') return e.preventDefault(), history(redo, undo);
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = TOOLS.find((x) => x.key === k);
  if (t) setTool(t.id);
  else if (k === 'm') (mirror = !mirror), renderTools();
  else if (k === '[' || k === ']') (cur = (cur + (k === ']' ? 1 : doc.frames.length - 1)) % doc.frames.length), draw(), renderFrames();
});

const stage = h('div', { class: 'stage' }, canvas);
document.getElementById('app')!.replaceChildren(
  topBar('Pixelforge', 'creative-tools'),
  h('main', { class: 'layout' },
    h('aside', { class: 'panel left' }, h('h2', {}, 'Tools'), toolBar,
      h('h2', {}, 'Colour'), h('div', { class: 'color-row' }, picker, paletteMenu), swatches),
    stage,
    h('aside', { class: 'panel right' },
      h('h2', {}, 'Frames'), frameList,
      h('div', { class: 'row' },
        h('button', { type: 'button', onclick: () => addFrame(false) }, 'New'),
        h('button', { type: 'button', onclick: () => addFrame(true) }, 'Copy'),
        h('button', { type: 'button', onclick: deleteFrame }, 'Delete')),
      h('label', { class: 'check' }, onionBox, ' Show previous frame (onion skin)'),
      h('h2', {}, 'Preview'), preview, h('label', { class: 'ctl' }, fpsInput, fpsOut),
      h('h2', {}, 'Export'),
      h('div', { class: 'row' }, scaleMenu, h('button', { type: 'button', onclick: () => exportPng(false) }, 'PNG'), h('button', { type: 'button', onclick: () => exportPng(true) }, 'Sprite sheet')),
      h('h2', {}, 'New drawing'), h('label', { class: 'ctl' }, 'Size ', sizeMenu),
      h('p', { class: 'hint' }, 'Your drawing saves automatically in this browser. Shortcuts: B, E, G, L, R, I for tools, M mirror, [ and ] for frames, Ctrl+Z undo.'))),
  toastEl,
);
renderTools();
renderPalette();
renderFrames();
new ResizeObserver(fit).observe(stage);
requestAnimationFrame(animate);
