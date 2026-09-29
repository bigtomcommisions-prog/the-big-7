import { rgba } from '../dom.ts';
import {
  AURORA, auroraUniforms, EVENT_HORIZON, eventHorizonUniforms, glScene, LAVA, lavaUniforms, LIQUID, liquidUniforms, SYNTHWAVE, synthwaveUniforms,
} from './gl.ts';
import { bokeh, fireflies, ocean, rain, sakura, snow, warp } from './particles.ts';
import type { ParamSpec, ThemeDef } from './types.ts';

const color = (key: string, label: string, def: string): ParamSpec => ({ key, label, type: 'color', default: def });
const range = (key: string, label: string, min: number, max: number, step: number, def: number, unit?: string): ParamSpec => ({ key, label, type: 'range', min, max, step, default: def, unit });
const toggle = (key: string, label: string, def: boolean): ParamSpec => ({ key, label, type: 'toggle', default: def });
const speed = range('speed', 'Animation speed', 0, 3, 0.05, 1, '×');

export const THEMES: ThemeDef[] = [
  {
    id: 'event-horizon', name: 'Event Horizon', blurb: 'A black hole bending starlight, with a spinning accretion disk.', mode: 'dark', font: 'grotesk', kind: 'gl',
    palette: { text: '#ecebff', accent: '#9a7dff', accent2: '#3ad8c4', card: '#0b0a1a', bg: '#02020a' },
    params: [color('diskA', 'Disk hot colour', '#ffd7a0'), color('diskB', 'Disk cool colour', '#8a5cff'), color('glow', 'Photon ring', '#6fe6ff'),
      range('size', 'Black hole size', 0.05, 0.22, 0.005, 0.12), range('tilt', 'Disk tilt', 0.12, 0.6, 0.01, 0.26), range('spin', 'Disk spin', 0, 3, 0.05, 1, '×'),
      range('x', 'Position across', -0.8, 0.8, 0.01, 0), range('y', 'Position up/down', -0.45, 0.45, 0.01, 0.24),
      range('stars', 'Stars', 0, 2, 0.05, 1), range('exposure', 'Brightness', 0.5, 3, 0.05, 1.8)],
    create: (c) => glScene(c, EVENT_HORIZON, eventHorizonUniforms),
    css: (p) => `radial-gradient(circle at 50% 50%, #000 0 8%, ${rgba(String(p.diskB), 0.35)} 12%, #02020a 45%)`,
  },
  {
    id: 'aurora', name: 'Aurora', blurb: 'Northern lights rippling over dark mountains.', mode: 'dark', font: 'inter', kind: 'gl',
    palette: { text: '#eafff6', accent: '#4ff2b0', accent2: '#8d7bff', card: '#06121a', bg: '#040b16' },
    params: [color('c1', 'Lower glow', '#35ff9f'), color('c2', 'Middle glow', '#2ec5ff'), color('c3', 'Upper glow', '#b36bff'), color('sky', 'Sky', '#0a1a33'),
      speed, range('intensity', 'Intensity', 0, 3, 0.05, 1.2), range('height', 'Height', 0.2, 0.7, 0.01, 0.42), range('stars', 'Stars', 0, 2, 0.05, 1), toggle('mountains', 'Mountains', true)],
    create: (c) => glScene(c, AURORA, auroraUniforms),
    css: (p) => `linear-gradient(180deg, ${p.sky} 0%, ${rgba(String(p.c2), 0.4)} 55%, ${rgba(String(p.c1), 0.5)} 70%, #02060c 72%)`,
  },
  {
    id: 'liquid', name: 'Liquid Gradient', blurb: 'Soft colour fields drifting into each other, with film grain.', mode: 'dark', font: 'inter', kind: 'gl',
    palette: { text: '#ffffff', accent: '#ff7ab6', accent2: '#7bdcff', card: '#1a1030', bg: '#1a1030' },
    params: [color('c1', 'Colour 1', '#ff5f8f'), color('c2', 'Colour 2', '#6a4cff'), color('c3', 'Colour 3', '#18c8ff'), color('c4', 'Colour 4', '#ffb46b'),
      speed, range('soft', 'Softness', 0, 1, 0.01, 0.6), range('warp', 'Swirl', 0, 2, 0.05, 0.6), range('grain', 'Grain', 0, 1.5, 0.05, 0.5)],
    create: (c) => glScene(c, LIQUID, liquidUniforms),
    css: (p) => `radial-gradient(at 20% 30%, ${p.c1}, transparent 55%), radial-gradient(at 80% 25%, ${p.c2}, transparent 55%), radial-gradient(at 75% 80%, ${p.c3}, transparent 55%), radial-gradient(at 25% 80%, ${p.c4}, transparent 55%), #1a1030`,
  },
  {
    id: 'synthwave', name: 'Synthwave', blurb: 'An 80s sunset over a neon grid that never ends.', mode: 'dark', font: 'orbitron', kind: 'gl',
    palette: { text: '#fff0fb', accent: '#ff4fd8', accent2: '#39e6ff', card: '#1a0630', bg: '#12031f' },
    params: [color('skyTop', 'Sky top', '#12031f'), color('skyBot', 'Sky horizon', '#7a1d6e'), color('sunA', 'Sun top', '#ffe066'), color('sunB', 'Sun bottom', '#ff2d95'),
      color('grid', 'Grid', '#39e6ff'), color('ground', 'Ground', '#0a0214'), speed, range('glow', 'Glow', 0, 2, 0.05, 1), range('stars', 'Stars', 0, 2, 0.05, 0.6),
      range('sunY', 'Sun height', -0.05, 0.4, 0.01, 0.03), range('sunSize', 'Sun size', 0.1, 0.45, 0.01, 0.22)],
    create: (c) => glScene(c, SYNTHWAVE, synthwaveUniforms),
    css: (p) => `linear-gradient(180deg, ${p.skyTop} 0%, ${p.skyBot} 55%, ${p.ground} 56%)`,
  },
  {
    id: 'lava', name: 'Lava Lamp', blurb: 'Warm blobs of wax rising and merging.', mode: 'dark', font: 'nunito', kind: 'gl',
    palette: { text: '#fff3ea', accent: '#ff8a3d', accent2: '#ffd166', card: '#2a0d12', bg: '#1d0a14' },
    params: [color('c1', 'Wax top', '#ffb347'), color('c2', 'Wax bottom', '#ff3d5a'), color('bg1', 'Glass top', '#2a0b2e'), color('bg2', 'Glass bottom', '#12040f'),
      speed, range('count', 'Blobs', 2, 10, 1, 7), range('size', 'Blob size', 0.5, 2, 0.05, 1)],
    create: (c) => glScene(c, LAVA, lavaUniforms),
    css: (p) => `linear-gradient(180deg, ${p.bg1}, ${p.bg2})`,
  },
  {
    id: 'warp', name: 'Warp Speed', blurb: 'Stars streaking past at light speed.', mode: 'dark', font: 'grotesk', kind: '2d',
    palette: { text: '#eef2ff', accent: '#7ea8ff', accent2: '#ffffff', card: '#070a18', bg: '#02030a' },
    params: [color('bg', 'Space', '#02030a'), color('star', 'Stars', '#cfd8ff'), speed, range('density', 'Star count', 0.2, 3, 0.1, 1), toggle('trails', 'Light trails', true)],
    create: warp,
  },
  {
    id: 'digital-rain', name: 'Digital Rain', blurb: 'Cascading glyphs, straight out of a hacker film.', mode: 'dark', font: 'mono', kind: '2d',
    palette: { text: '#d7ffe1', accent: '#35ff6b', accent2: '#aaffc2', card: '#010801', bg: '#010401' },
    params: [color('glyph', 'Glyphs', '#35ff6b'), color('bg', 'Background', '#010401'), speed, range('density', 'Density', 0.5, 2, 0.05, 1),
      { key: 'charset', label: 'Characters', type: 'select', default: 'katakana', options: [{ value: 'katakana', label: 'Katakana' }, { value: 'binary', label: 'Binary' }, { value: 'hex', label: 'Hex' }, { value: 'latin', label: 'Latin' }] },
      toggle('glow', 'Bright heads', true)],
    create: rain,
  },
  {
    id: 'fireflies', name: 'Firefly Forest', blurb: 'Fireflies drifting through a pine forest at dusk.', mode: 'dark', font: 'nunito', kind: '2d',
    palette: { text: '#fff8e1', accent: '#ffd966', accent2: '#8be0b4', card: '#06140f', bg: '#050b1a' },
    params: [color('top', 'Sky', '#050b1a'), color('bottom', 'Forest glow', '#0d2a26'), color('trees', 'Trees', '#040a0a'), color('fly', 'Fireflies', '#ffe98a'),
      speed, range('count', 'Fireflies', 5, 200, 1, 60)],
    create: fireflies,
  },
  {
    id: 'snowfall', name: 'Snowfall', blurb: 'A quiet winter evening, snow drifting down.', mode: 'dark', font: 'inter', kind: '2d',
    palette: { text: '#ffffff', accent: '#9ad0ff', accent2: '#ffffff', card: '#1a2740', bg: '#1a2740' },
    params: [color('top', 'Sky top', '#1a2740'), color('bottom', 'Sky bottom', '#5d6f8f'), color('flake', 'Snow', '#ffffff'), speed,
      range('density', 'Amount', 0.2, 3, 0.1, 1), range('size', 'Flake size', 0.5, 2.5, 0.05, 1), range('wind', 'Wind', -2, 2, 0.05, 0.3)],
    create: snow,
  },
  {
    id: 'sakura', name: 'Sakura', blurb: 'Cherry blossom petals on a spring breeze.', mode: 'light', font: 'serif', kind: '2d',
    palette: { text: '#4a2233', accent: '#e2557f', accent2: '#8b6fd6', card: '#ffffff', bg: '#fde7ef' },
    params: [color('top', 'Sky top', '#fde7ef'), color('bottom', 'Sky bottom', '#f5f0ff'), color('petal', 'Petals', '#f7a8c4'), color('petal2', 'Petals (light)', '#fbd3e1'),
      speed, range('density', 'Amount', 0.2, 3, 0.1, 1), range('wind', 'Breeze', -2, 2, 0.05, 0.5)],
    create: sakura,
  },
  {
    id: 'bokeh', name: 'City Rain', blurb: 'Rain against the window, city lights out of focus.', mode: 'dark', font: 'inter', kind: '2d',
    palette: { text: '#f4f1ff', accent: '#ff9a3c', accent2: '#4fb8ff', card: '#0c0a16', bg: '#07080f' },
    params: [color('top', 'Sky', '#07080f'), color('bottom', 'Street glow', '#1a1226'), color('c1', 'Light 1', '#ff9a3c'), color('c2', 'Light 2', '#ff4f7a'), color('c3', 'Light 3', '#4fb8ff'),
      color('drop', 'Rain', '#b9c7ff'), range('lights', 'Lights', 0, 120, 1, 40), range('rain', 'Rain', 0, 3, 0.05, 1)],
    create: bokeh,
  },
  {
    id: 'ocean', name: 'Ocean Sunset', blurb: 'Waves rolling in under a low sun.', mode: 'dark', font: 'serif', kind: '2d',
    palette: { text: '#fff6ee', accent: '#ffb86b', accent2: '#7fd3ff', card: '#1b1430', bg: '#2b1b4a' },
    params: [color('skyTop', 'Sky top', '#2b1b4a'), color('skyBottom', 'Sky horizon', '#ff9a6b'), color('sun', 'Sun', '#ffd27a'), color('water', 'Water', '#16304f'), color('deep', 'Deep water', '#070d1c'),
      speed, range('waves', 'Wave height', 0, 3, 0.05, 1)],
    create: ocean,
  },
  {
    id: 'paper', name: 'Paper', blurb: 'Calm, bright and minimal, like good stationery.', mode: 'light', font: 'serif', kind: 'none',
    palette: { text: '#2b2621', accent: '#c2410c', accent2: '#1d4ed8', card: '#ffffff', bg: '#f4efe6' },
    params: [color('paper', 'Paper', '#f4efe6'), color('shade', 'Corner shade', '#e6ddcc'), range('grain', 'Texture', 0, 1, 0.05, 0.5)],
    bodyClass: 'theme-paper',
    css: (p) => `radial-gradient(circle at 15% 10%, ${p.paper}, ${p.shade})`,
  },
  {
    id: 'terminal', name: 'Terminal', blurb: 'A glowing CRT monitor, scanlines and all.', mode: 'dark', font: 'mono', kind: 'none',
    palette: { text: '#b7ffc9', accent: '#39ff88', accent2: '#ffd166', card: '#031006', bg: '#020a04' },
    params: [color('phosphor', 'Phosphor glow', '#0f3d1c'), color('screen', 'Screen', '#020a04'), range('scanlines', 'Scanlines', 0, 1, 0.05, 0.6), toggle('flicker', 'Flicker', true)],
    bodyClass: 'theme-terminal',
    css: (p) => `radial-gradient(ellipse at center, ${p.phosphor} 0%, ${p.screen} 75%)`,
  },
  {
    id: 'midnight', name: 'Midnight', blurb: 'A clean, dark gradient that stays out of the way.', mode: 'dark', font: 'inter', kind: 'none',
    palette: { text: '#e8ecf5', accent: '#7c9cff', accent2: '#c792ea', card: '#141a2a', bg: '#0b0f1a' },
    params: [color('top', 'Top', '#131a2e'), color('bottom', 'Bottom', '#07090f'), color('glow', 'Glow', '#3b2d80'), range('glowAmount', 'Glow amount', 0, 1, 0.05, 0.5)],
    css: (p) => `radial-gradient(ellipse at 70% -10%, ${rgba(String(p.glow), Number(p.glowAmount))}, transparent 60%), linear-gradient(180deg, ${p.top}, ${p.bottom})`,
  },
  {
    id: 'photo', name: 'Your Photo', blurb: 'Any picture you like as the background. It stays on your device.', mode: 'dark', font: 'inter', kind: 'none', usesImage: true,
    palette: { text: '#ffffff', accent: '#ffffff', accent2: '#ffd166', card: '#101010', bg: '#111111' },
    params: [color('fallback', 'Colour behind the photo', '#111111'), range('blur', 'Blur', 0, 30, 1, 0, 'px'), range('shade', 'Darken', 0, 0.8, 0.02, 0.25),
      { key: 'fit', label: 'Fit', type: 'select', default: 'cover', options: [{ value: 'cover', label: 'Fill screen' }, { value: 'contain', label: 'Whole photo' }] }],
    css: (p) => String(p.fallback),
  },
];

export const themeById = new Map(THEMES.map((t) => [t.id, t]));

/** A theme's params with defaults filled in. */
export function paramsFor(theme: ThemeDef, saved: Record<string, unknown> = {}) {
  const out: Record<string, string | number | boolean> = {};
  for (const p of theme.params) {
    const v = saved[p.key];
    out[p.key] = typeof v === typeof p.default ? (v as string | number | boolean) : p.default;
  }
  return out;
}
