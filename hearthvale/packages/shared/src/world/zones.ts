import type { HouseLayout, WorldLayout, Zone } from './layout.ts';

/** Convert a world point into a building's local frame (local +Z = front/door). */
export function toLocal(h: { x: number; z: number; ry: number }, x: number, z: number): { lx: number; lz: number } {
  const dx = x - h.x;
  const dz = z - h.z;
  const c = Math.cos(h.ry);
  const s = Math.sin(h.ry);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

export function isInsideHouse(h: HouseLayout, x: number, z: number, margin = 0): boolean {
  const { lx, lz } = toLocal(h, x, z);
  return Math.abs(lx) < h.w / 2 - margin && Math.abs(lz) < h.d / 2 - margin;
}

/** Which named area of the world a point is in. Used for HUD, chat panel and voice occlusion. */
export function zoneAt(layout: WorldLayout, x: number, z: number): Zone {
  for (const t of layout.towns) {
    if (Math.hypot(x - t.x, z - t.z) > t.radius) continue;
    for (const h of layout.houses) {
      if (h.townKey === t.key && isInsideHouse(h, x, z, 0.2)) {
        return { type: 'house', channelId: h.channelId, townKey: t.key };
      }
    }
    for (const p of layout.plazas) {
      if (p.townKey === t.key && Math.hypot(x - p.x, z - p.z) < p.radius) {
        return { type: 'plaza', channelId: p.channelId, townKey: t.key };
      }
    }
    return { type: 'town', townKey: t.key };
  }
  if (Math.hypot(x - layout.hub.x, z - layout.hub.z) < layout.hub.radius + 4) return { type: 'hub' };
  return { type: 'wild' };
}
