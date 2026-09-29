// Self-hosted fonts: no requests to Google Fonts.
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/orbitron';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './styles.css';
import { h, icon, rgba, uid } from './dom.ts';
import { Background } from './engine.ts';
import { clearImages, clearSaved, defaultState, load, putImage, save, type Size, type State, type ThemeSettings, type WidgetInstance } from './store.ts';
import { paramsFor, THEMES, themeById } from './themes/index.ts';
import { FONTS, type Palette, type ThemeDef } from './themes/types.ts';
import { fieldControl } from './ui/forms.ts';
import { guideView } from './ui/guide.ts';
import { Panel, type AppApi } from './ui/panel.ts';
import { widgetByType } from './widgets/index.ts';
import type { WidgetCtx } from './widgets/types.ts';

let state: State = load();
let editing = false;
/** True only while the page's first render runs (so e.g. search autofocus doesn't steal focus later). */
let firstRender = true;

const bgHost = h('div', { class: 'bg', 'aria-hidden': 'true' });
const dim = h('div', { class: 'bg-dim', 'aria-hidden': 'true' });
const grid = h('main', { class: 'grid', id: 'main', 'aria-label': 'Your widgets' });
const siteBar = h('header', { class: 'sitebar' });

const theme = (): ThemeDef => themeById.get(state.themeId) ?? THEMES[0]!;
function themeSettings(): ThemeSettings {
  const id = theme().id;
  state.themes[id] ??= { params: {}, palette: {} };
  const ts = state.themes[id]!;
  ts.params ??= {};
  ts.palette ??= {};
  return ts;
}
const palette = (): Palette => ({ ...theme().palette, ...themeSettings().palette });

const bg = new Background(bgHost, () => ({ params: paramsFor(theme(), themeSettings().params), palette: palette() }), () => ({ motion: state.appearance.motion, quality: state.appearance.quality }));

// ── Look: CSS variables from the theme palette + appearance settings ───────────────────────────
function applyLook() {
  const t = theme(), p = palette(), a = state.appearance, ts = themeSettings();
  const r = document.documentElement.style;
  const opacity = a.cardStyle === 'solid' ? Math.max(0.85, a.cardOpacity) : a.cardStyle === 'bare' || a.cardStyle === 'outline' ? 0 : a.cardOpacity;
  r.setProperty('--text', p.text);
  r.setProperty('--accent', p.accent);
  r.setProperty('--accent2', p.accent2);
  r.setProperty('--card', rgba(p.card, opacity));
  r.setProperty('--card-solid', p.card);
  r.setProperty('--line', rgba(p.text, a.cardStyle === 'outline' ? 0.28 : 0.12));
  r.setProperty('--blur', a.cardStyle === 'glass' ? `${a.blur}px` : '0px');
  r.setProperty('--radius', `${a.radius}px`);
  r.setProperty('--font', FONTS[ts.font ?? t.font].css);
  r.setProperty('--scale', String(a.scale));
  r.setProperty('--dim', String(a.dim));
  r.setProperty('--maxw', a.width === 'narrow' ? '760px' : a.width === 'wide' ? '1400px' : '1080px');
  document.documentElement.dataset.mode = t.mode;
  document.documentElement.style.colorScheme = t.mode;
  document.body.className = [t.bodyClass ?? '', editing ? 'editing' : '', `cards-${a.cardStyle}`, panel?.open ? 'panel-open' : ''].filter(Boolean).join(' ');
  const params = paramsFor(t, ts.params);
  r.setProperty('--scan', String(params.scanlines ?? 0));
  r.setProperty('--grain', String(params.grain ?? 0));
  document.body.classList.toggle('flicker', params.flicker === true);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bg);
  siteBar.hidden = !a.showSiteBar;
  bg.applyCss();
  bg.redraw();
}

// ── Widgets ────────────────────────────────────────────────────────────────────────────────────
const mounted = new Map<string, { el: HTMLElement; cleanup: (() => void)[] }>();

function unmount(id: string) {
  const m = mounted.get(id);
  if (!m) return;
  for (const fn of m.cleanup) fn();
  mounted.delete(id);
}

function mountWidget(w: WidgetInstance): HTMLElement {
  unmount(w.id);
  const def = widgetByType.get(w.type);
  const cleanup: (() => void)[] = [];
  const body = h('div', { class: 'w-body' });
  const el = h('section', { class: `widget w-${w.type} size-${w.size}`, 'data-id': w.id, 'aria-label': def?.name ?? w.type });
  if (!def) {
    body.append(h('p', { class: 'muted' }, 'This widget isn’t available any more.'));
  } else {
    const ctx: WidgetCtx = {
      config: w.config, general: state.general, size: w.size, editing, id: w.id, initial: firstRender,
      save: (patch) => { Object.assign(w.config, patch); save(state); },
      every: (ms, fn) => { fn(); const t = setInterval(fn, ms); cleanup.push(() => clearInterval(t)); },
      onCleanup: (fn) => cleanup.push(fn),
    };
    try {
      def.render(body, ctx);
    } catch (err) {
      console.error(err);
      body.replaceChildren(h('p', { class: 'muted' }, 'Something went wrong in this widget.'));
    }
  }
  el.append(body);
  if (editing) el.prepend(editBar(w, el));
  mounted.set(w.id, { el, cleanup });
  return el;
}

function editBar(w: WidgetInstance, el: HTMLElement): HTMLElement {
  const def = widgetByType.get(w.type);
  const idx = () => state.widgets.findIndex((x) => x.id === w.id);
  const move = (d: number) => {
    const i = idx(), j = i + d;
    if (j < 0 || j >= state.widgets.length) return;
    [state.widgets[i], state.widgets[j]] = [state.widgets[j]!, state.widgets[i]!];
    commit(true);
    requestAnimationFrame(() => (mounted.get(w.id)?.el.querySelector<HTMLButtonElement>(d < 0 ? '[data-act=left]' : '[data-act=right]'))?.focus());
  };
  const sizes = def?.sizes ?? ['s', 'm', 'l'];
  const sizeLabel = { s: 'Small', m: 'Medium', l: 'Full width' } as const;
  const sizeBtn = h('button', { class: 'icon-btn tiny', type: 'button', title: `Size: ${sizeLabel[w.size]}`, 'aria-label': `Change size (now ${sizeLabel[w.size]})`, onclick: () => {
    const next = sizes[(sizes.indexOf(w.size) + 1) % sizes.length] as Size;
    w.size = next;
    commit(true);
  } }, icon('resize'), h('span', {}, w.size.toUpperCase()));
  const bar = h('div', { class: 'edit-bar' },
    h('span', { class: 'grip', title: 'Drag to move', 'aria-hidden': 'true' }, icon('grip')),
    h('span', { class: 'edit-name' }, def?.name ?? w.type),
    h('button', { class: 'icon-btn tiny', type: 'button', 'data-act': 'left', 'aria-label': 'Move earlier', title: 'Move earlier', onclick: () => move(-1) }, icon('left')),
    h('button', { class: 'icon-btn tiny', type: 'button', 'data-act': 'right', 'aria-label': 'Move later', title: 'Move later', onclick: () => move(1) }, icon('right')),
    sizeBtn,
    def?.fields?.length ? h('button', { class: 'icon-btn tiny', type: 'button', 'aria-label': `${def.name} settings`, title: 'Settings', onclick: () => widgetSettings(w) }, icon('settings')) : '',
    h('button', { class: 'icon-btn tiny danger', type: 'button', 'aria-label': `Remove ${def?.name ?? 'widget'}`, title: 'Remove', onclick: () => {
      state.widgets = state.widgets.filter((x) => x.id !== w.id);
      unmount(w.id);
      el.remove();
      save(state);
    } }, icon('trash')));
  // Drag & drop reordering
  el.draggable = true;
  el.addEventListener('dragstart', (e) => { e.dataTransfer?.setData('text/plain', w.id); el.classList.add('dragging'); });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop-target'); });
  el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drop-target');
    const from = e.dataTransfer?.getData('text/plain');
    if (!from || from === w.id) return;
    const moving = state.widgets.find((x) => x.id === from);
    if (!moving) return;
    const rest = state.widgets.filter((x) => x.id !== from);
    const rect = el.getBoundingClientRect();
    const after = e.clientX > rect.left + rect.width / 2;
    rest.splice(rest.findIndex((x) => x.id === w.id) + (after ? 1 : 0), 0, moving);
    state.widgets = rest;
    commit(true);
  });
  return bar;
}

function renderGrid() {
  for (const id of [...mounted.keys()]) unmount(id);
  const els = state.widgets.map(mountWidget);
  if (editing) {
    els.push(h('button', { class: 'widget add-tile size-s', type: 'button', onclick: () => panel.show('widgets') }, icon('plus', '1.6em'), 'Add a widget'));
  }
  if (!state.widgets.length && !editing) {
    els.push(h('div', { class: 'empty' }, h('p', {}, 'Your page is empty.'), h('button', { class: 'btn', type: 'button', onclick: () => panel.show('widgets') }, icon('plus'), 'Add widgets')));
  }
  grid.replaceChildren(...els);
}

function remount(w: WidgetInstance) {
  const old = mounted.get(w.id)?.el;
  if (old) old.replaceWith(mountWidget(w));
}

function widgetSettings(w: WidgetInstance) {
  const def = widgetByType.get(w.type);
  if (!def?.fields) return;
  let t = 0;
  const dlg = h('dialog', { class: 'modal', 'aria-label': `${def.name} settings` },
    h('div', { class: 'modal-head' }, h('h2', {}, icon(def.icon), ` ${def.name}`), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => dlg.close() }, icon('close'))),
    h('div', { class: 'modal-body' }, ...def.fields.map((f) => fieldControl(f, w.config[f.key], (v) => {
      w.config[f.key] = v;
      clearTimeout(t);
      t = window.setTimeout(() => { save(state); remount(w); }, 250);
    }))),
    h('div', { class: 'modal-foot' }, h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Done')));
  dlg.addEventListener('close', () => { clearTimeout(t); save(state); remount(w); dlg.remove(); });
  document.body.append(dlg);
  dlg.showModal();
}

function commit(rerender = false) {
  save(state);
  if (rerender) renderGrid();
}

function setEditing(on: boolean) {
  editing = on;
  editBtn.replaceChildren(icon(on ? 'check' : 'pencil'), h('span', {}, on ? 'Done' : 'Edit'));
  editBtn.setAttribute('aria-pressed', String(on));
  applyLook();
  renderGrid();
}

// ── App API for the customise panel ───────────────────────────────────────────────────────────
const app: AppApi = {
  get state() { return state; },
  theme, themeSettings, palette,
  setTheme(id) {
    state.themeId = id;
    bg.setTheme(theme());
    applyLook();
    save(state);
  },
  themeChanged() {
    applyLook();
    save(state);
  },
  appearanceChanged() {
    applyLook();
    bg.resize();
    bg.play();
    save(state);
  },
  generalChanged() {
    save(state);
    renderGrid();
  },
  addWidget(type) {
    const def = widgetByType.get(type);
    if (!def) return;
    state.widgets.push({ id: uid(), type, size: def.defaultSize, config: def.defaults() });
    commit(true);
  },
  replaceState(s) {
    state = s;
    save(state);
    bg.setTheme(theme());
    applyLook();
    renderGrid();
    panel.render();
  },
  resetAll() {
    clearSaved();
    void clearImages();
    app.replaceState(defaultState());
  },
  async uploadBackground(file) {
    await putImage('background', file);
    await bg.loadPhoto();
  },
};

// ── Chrome: site bar, controls, footer ─────────────────────────────────────────────────────────
const panel = new Panel(app);
const editBtn = h('button', { class: 'ctl-btn', type: 'button', 'aria-pressed': 'false', title: 'Edit layout (E)', onclick: () => setEditing(!editing) }, icon('pencil'), h('span', {}, 'Edit'));
const controls = h('div', { class: 'controls' },
  editBtn,
  h('button', { class: 'ctl-btn', type: 'button', title: 'Themes & settings (T)', onclick: () => panel.toggle('themes') }, icon('palette'), h('span', {}, 'Customise')),
  h('a', { class: 'ctl-btn', href: '#/setup', title: 'Make this your home page' }, icon('help'), h('span', {}, 'Set as home page')));

/** The optional Big Tom Dev bar (Customise → Look), off by default. */
function buildSiteBar() {
  const logo = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="brand-logo" aria-hidden="true"><defs><linearGradient id="btd-hb" gradientUnits="userSpaceOnUse" x1="0" y1="7" x2="0" y2="57" gradientTransform="rotate(-45 32 32)"><stop offset="0" stop-color="#e0704a"/><stop offset="1" stop-color="#8183e3"/></linearGradient></defs><rect x="14" y="14" width="36" height="36" rx="9" transform="rotate(45 32 32)" fill="url(#btd-hb)"/></svg>', 'image/svg+xml').documentElement;
  siteBar.replaceChildren(h('div', { class: 'sitebar-inner' },
    h('a', { class: 'brand', href: '/' }, document.importNode(logo, true), h('span', {}, 'Big Tom Dev')),
    h('nav', { class: 'tabs', 'aria-label': 'Big Tom Dev' }, h('a', { class: 'tab', href: '/' }, 'Home'), h('a', { class: 'tab', href: '/the-big-7/' }, 'The Big 7'))));
}

const footer = h('footer', { class: 'foot' }, 'Homebase by ', h('a', { href: '/' }, 'Big Tom Dev'), ' · Saved only in this browser · ', h('a', { href: '/privacy/#homebase' }, 'Privacy'), ' · ', h('a', { href: '/terms/#homebase' }, 'Terms'));

// ── Routing (#/setup shows the browser guide) ──────────────────────────────────────────────────
let guide: HTMLElement | null = null;
function route() {
  const want = location.hash === '#/setup';
  if (want && !guide) {
    guide = guideView(() => { history.replaceState(null, '', location.pathname); route(); });
    document.body.append(guide);
    guide.querySelector<HTMLButtonElement>('.guide-btn.active')?.focus();
  } else if (!want && guide) {
    guide.remove();
    guide = null;
  }
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────────────────────
addEventListener('keydown', (e) => {
  // Dialogs and the setup guide handle their own Escape.
  if (document.querySelector('dialog[open]') || guide) return;
  if (e.key === 'Escape' && panel.open) { panel.close(); return; }
  const t = e.target as HTMLElement | null;
  if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName)))) return;
  if (e.key === 'e') setEditing(!editing);
  else if (e.key === 't') panel.toggle('themes');
  else if (e.key === 'Escape' && editing) setEditing(false);
});

buildSiteBar();
// ── Boot ───────────────────────────────────────────────────────────────────────────────────────
document.body.append(bgHost, dim, h('a', { class: 'skip', href: '#main' }, 'Skip to widgets'), siteBar, controls, h('div', { class: 'page' }, grid, footer), panel.el);
bg.setTheme(theme());
applyLook();
renderGrid();
firstRender = false;
addEventListener('hashchange', route);
route();
// Other tabs of Homebase stay in sync when settings change.
addEventListener('storage', (e) => {
  if (e.key !== 'homebase.v1' || !e.newValue) return;
  app.replaceState(load());
});
