import { uid } from './dom.ts';
import type { FontId, Palette, ParamValue } from './themes/types.ts';

export type Size = 's' | 'm' | 'l';

export interface WidgetInstance {
  id: string;
  type: string;
  size: Size;
  config: Record<string, unknown>;
}

export interface ThemeSettings {
  params: Record<string, ParamValue>;
  palette: Partial<Palette>;
  font?: FontId;
}

export interface Appearance {
  cardStyle: 'glass' | 'solid' | 'outline' | 'bare';
  cardOpacity: number;
  blur: number;
  radius: number;
  dim: number;
  motion: 'auto' | 'full' | 'reduced' | 'off';
  quality: 'auto' | 'high' | 'balanced' | 'low';
  scale: number;
  width: 'narrow' | 'normal' | 'wide';
  showSiteBar: boolean;
}

export interface General {
  name: string;
  use24h: boolean;
  showSeconds: boolean;
  tempUnit: 'c' | 'f';
  weekStart: 'mon' | 'sun';
  favicons: boolean;
  linksNewTab: boolean;
}

export interface State {
  version: 1;
  themeId: string;
  themes: Record<string, ThemeSettings>;
  appearance: Appearance;
  general: General;
  widgets: WidgetInstance[];
}

const KEY = 'homebase.v1';

export const DEFAULT_APPEARANCE: Appearance = {
  cardStyle: 'glass', cardOpacity: 0.55, blur: 18, radius: 18, dim: 0, motion: 'auto', quality: 'auto', scale: 1, width: 'normal', showSiteBar: false,
};

export const DEFAULT_GENERAL: General = {
  name: '', use24h: true, showSeconds: false, tempUnit: 'c', weekStart: 'mon', favicons: true, linksNewTab: false,
};

export function defaultWidgets(): WidgetInstance[] {
  const w = (type: string, size: Size, config: Record<string, unknown> = {}) => ({ id: uid(), type, size, config });
  return [
    w('clock', 'l', { style: 'digital', showDate: true }),
    w('search', 'l', { engine: 'google', autofocus: true }),
    w('weather', 's', { place: 'London' }),
    w('todo', 's', { items: [] }),
    w('notes', 's', { text: '' }),
    w('progress', 's', {}),
  ];
}

export function defaultState(): State {
  return { version: 1, themeId: 'bokeh', themes: {}, appearance: { ...DEFAULT_APPEARANCE }, general: { ...DEFAULT_GENERAL }, widgets: defaultWidgets() };
}

/** Fill any missing fields (older saves, hand-edited imports). */
export function normalise(raw: unknown): State {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<State>;
  return {
    version: 1,
    themeId: typeof r.themeId === 'string' ? r.themeId : d.themeId,
    themes: r.themes && typeof r.themes === 'object' ? r.themes : {},
    appearance: { ...d.appearance, ...(r.appearance ?? {}) },
    general: { ...d.general, ...(r.general ?? {}) },
    widgets: Array.isArray(r.widgets)
      ? r.widgets.filter((w): w is WidgetInstance => !!w && typeof w === 'object' && typeof (w as WidgetInstance).type === 'string')
        .map((w) => ({ id: typeof w.id === 'string' ? w.id : uid(), type: w.type, size: (['s', 'm', 'l'] as const).includes(w.size) ? w.size : 's', config: w.config && typeof w.config === 'object' ? w.config : {} }))
      : d.widgets,
  };
}

export function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalise(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

let saveTimer = 0;
/** Debounced save to this browser's local storage. */
export function save(state: State) {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Homebase: could not save settings', err);
    }
  }, 250);
}

export function exportJson(state: State): string {
  return JSON.stringify({ app: 'homebase', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function clearSaved() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// â”€â”€ Images (background photo, photo widget) live in IndexedDB: too big for localStorage.
const DB = 'homebase';
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('images');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function putImage(key: string, blob: Blob): Promise<void> {
  const d = await db();
  await new Promise<void>((res, rej) => {
    const tx = d.transaction('images', 'readwrite');
    tx.objectStore('images').put(blob, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
export async function getImage(key: string): Promise<Blob | null> {
  try {
    const d = await db();
    return await new Promise((res) => {
      const req = d.transaction('images').objectStore('images').get(key);
      req.onsuccess = () => res((req.result as Blob | undefined) ?? null);
      req.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}
export async function deleteImage(key: string): Promise<void> {
  try {
    const d = await db();
    d.transaction('images', 'readwrite').objectStore('images').delete(key);
  } catch {
    /* ignore */
  }
}
export async function clearImages(): Promise<void> {
  try {
    const d = await db();
    d.transaction('images', 'readwrite').objectStore('images').clear();
  } catch {
    /* ignore */
  }
}
