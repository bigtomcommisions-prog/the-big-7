// The drawing document and the pixel operations on it. No DOM here, so it's easy to test.
// A colour is 0xRRGGBBAA as an unsigned number; 0 is transparent.

export interface Doc {
  w: number;
  h: number;
  frames: number[][];
  fps: number;
}

export const SIZES = [16, 24, 32, 48, 64];

export const blankFrame = (w: number, h: number) => Array<number>(w * h).fill(0);
export const newDoc = (size = 32): Doc => ({ w: size, h: size, frames: [blankFrame(size, size)], fps: 8 });

export const hexToColor = (hex: string) => ((parseInt(hex.slice(1), 16) << 8) | 0xff) >>> 0;
export const colorToHex = (c: number) => `#${(c >>> 8).toString(16).padStart(6, '0')}`;

/** Every cell on the straight line between two cells (Bresenham). */
export function line(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** The outline of the rectangle with these two corners. */
export function rect(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const [l, r, t, b] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
  return [...line(l, t, r, t), ...line(l, b, r, b), ...line(l, t, l, b), ...line(r, t, r, b)];
}

/** Fills the 4-connected area of matching colour around (x, y). */
export function fill(px: number[], w: number, h: number, x: number, y: number, color: number) {
  const target = px[y * w + x];
  if (target === undefined || target === color) return;
  const stack = [y * w + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (px[i] !== target) continue;
    px[i] = color;
    const cx = i % w;
    if (cx > 0) stack.push(i - 1);
    if (cx < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
}

/** Checks a document loaded from storage. Returns null if anything is off. */
export function validDoc(d: unknown): Doc | null {
  if (!d || typeof d !== 'object') return null;
  const { w, h, frames, fps } = d as Doc;
  if (!SIZES.includes(w) || !SIZES.includes(h) || !Array.isArray(frames) || !frames.length || frames.length > 64) return null;
  if (!frames.every((f) => Array.isArray(f) && f.length === w * h && f.every((c) => Number.isInteger(c) && c >= 0 && c <= 0xffffffff))) return null;
  return { w, h, frames, fps: Number.isInteger(fps) && fps >= 1 && fps <= 24 ? fps : 8 };
}

export const PALETTES: Record<string, string[]> = {
  'PICO-8': ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
  'Sweetie 16': ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'],
  'Game Boy': ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  Greyscale: ['#000000', '#242424', '#494949', '#6d6d6d', '#929292', '#b6b6b6', '#dbdbdb', '#ffffff'],
};
