/** A user-adjustable setting, rendered automatically in the customise panel. */
export type ParamSpec =
  | { key: string; label: string; type: 'color'; default: string }
  | { key: string; label: string; type: 'range'; min: number; max: number; step: number; default: number; unit?: string }
  | { key: string; label: string; type: 'toggle'; default: boolean }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; default: string };

export type ParamValue = string | number | boolean;
export type Params = Record<string, ParamValue>;

/** Colours the interface (text, cards, buttons) uses on top of a theme's background. */
export interface Palette {
  text: string;
  accent: string;
  accent2: string;
  card: string;
  bg: string;
}

export const FONTS = {
  inter: { label: 'Inter', css: "'Inter Variable', system-ui, sans-serif" },
  grotesk: { label: 'Space Grotesk', css: "'Space Grotesk Variable', system-ui, sans-serif" },
  mono: { label: 'JetBrains Mono', css: "'JetBrains Mono Variable', ui-monospace, monospace" },
  serif: { label: 'Playfair Display', css: "'Playfair Display Variable', Georgia, serif" },
  orbitron: { label: 'Orbitron', css: "'Orbitron Variable', 'Space Grotesk Variable', sans-serif" },
  nunito: { label: 'Nunito', css: 'Nunito, system-ui, sans-serif' },
  system: { label: 'System', css: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
} as const;
export type FontId = keyof typeof FONTS;

/** What a scene is given every frame. */
export interface SceneInput {
  params: Params;
  palette: Palette;
}

export interface Scene {
  /** Canvas size in device pixels; `scale` is device pixels per CSS pixel. */
  resize(width: number, height: number, scale: number): void;
  /** Draw one frame. `time` is seconds since start (frozen when motion is off). */
  frame(time: number, dt: number, input: SceneInput): void;
  destroy(): void;
}

export interface ThemeDef {
  id: string;
  name: string;
  blurb: string;
  mode: 'dark' | 'light';
  font: FontId;
  palette: Palette;
  params: ParamSpec[];
  /** 'gl' = WebGL fragment shader, '2d' = canvas particles, 'none' = CSS only. */
  kind: 'gl' | '2d' | 'none';
  create?: (canvas: HTMLCanvasElement) => Scene | null;
  /** Extra CSS classes on <body> (e.g. scanlines). */
  bodyClass?: string;
  /** Static CSS background (used by 'none' themes and as the fallback when WebGL is unavailable). */
  css?: (p: Params, palette: Palette) => string;
  /** The theme uses the uploaded background image. */
  usesImage?: boolean;
}
