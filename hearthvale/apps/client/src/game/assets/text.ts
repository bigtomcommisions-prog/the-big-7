import * as THREE from 'three';
import { drawIcon, type IconName } from '../../ui/icons.ts';

/** Render text onto a canvas texture for in-world signs. */
export function textTexture(text: string, opts: { width?: number; height?: number; bg?: string; fg?: string; font?: string; border?: string; icon?: IconName } = {}): THREE.CanvasTexture {
  const w = opts.width ?? 512;
  const hgt = opts.height ?? 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hgt;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = opts.bg ?? '#8a5a3c';
  ctx.fillRect(0, 0, w, hgt);
  // wood grain
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#000';
  for (let y = 12; y < hgt; y += 22) ctx.fillRect(0, y, w, 3);
  ctx.globalAlpha = 1;
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, hgt - 10);
  }
  ctx.fillStyle = opts.fg ?? '#fff6e5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = Math.floor(hgt * 0.5);
  const family = opts.font ?? "900 {s}px Nunito, system-ui, sans-serif";
  const iconSpace = () => (opts.icon ? size * 1.25 : 0);
  do {
    ctx.font = family.replace('{s}', String(size));
    size -= 2;
  } while (ctx.measureText(text).width + iconSpace() > w * 0.9 && size > 12);
  size += 2;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowOffsetY = 3;
  const textW = ctx.measureText(text).width;
  const left = (w - textW - iconSpace()) / 2;
  if (opts.icon) drawIcon(ctx, opts.icon, left, hgt / 2 - size / 2 + 2, size, opts.fg ?? '#fff6e5');
  ctx.fillText(text, left + iconSpace() + textW / 2, hgt / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A plank sign mesh with text on the front face. */
export function signBoard(text: string, w: number, h: number, opts: Parameters<typeof textTexture>[1] = {}): THREE.Mesh {
  const tex = textTexture(text, { width: 512, height: Math.round((512 * h) / w), ...opts });
  const front = new THREE.MeshLambertMaterial({ map: tex });
  const side = new THREE.MeshLambertMaterial({ color: opts.bg ?? '#8a5a3c' });
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), [side, side, side, side, front, side]);
  mesh.castShadow = true;
  return mesh;
}
