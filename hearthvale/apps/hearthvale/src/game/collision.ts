/**
 * World collision: oriented boxes (walls, fences, water) and circles (trees, lamps) in a spatial
 * hash. The player is a vertical cylinder; we push it out of overlapping shapes in XZ, and let it
 * stand on tops of low shapes (so you can hop onto benches, crates, bridges' rails, etc.).
 */

export interface BoxCollider {
  kind: 'box';
  x: number;
  z: number;
  hw: number;
  hd: number;
  ry: number;
  y0: number;
  y1: number;
  /** Not walkable on top (e.g. water). */
  noStand?: boolean;
  /** Blocks camera rays. */
  camera?: boolean;
}

export interface CircleCollider {
  kind: 'circle';
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
  camera?: boolean;
  noStand?: boolean;
}

export type Collider = BoxCollider | CircleCollider;

const CELL = 8;

export class CollisionWorld {
  private cells = new Map<number, Collider[]>();
  radius = 200;

  private key(cx: number, cz: number) {
    return (cx + 2048) * 4096 + (cz + 2048);
  }

  clear() {
    this.cells.clear();
  }

  add(c: Collider) {
    const ext = c.kind === 'box' ? Math.hypot(c.hw, c.hd) : c.r;
    const x0 = Math.floor((c.x - ext) / CELL), x1 = Math.floor((c.x + ext) / CELL);
    const z0 = Math.floor((c.z - ext) / CELL), z1 = Math.floor((c.z + ext) / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = this.key(x, z);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(c);
      }
    }
  }

  /** Box with local offset (lx, lz) relative to a rotated parent. */
  addLocalBox(px: number, pz: number, pry: number, lx: number, lz: number, hw: number, hd: number, y0: number, y1: number, extra: Partial<BoxCollider> = {}) {
    const c = Math.cos(pry), s = Math.sin(pry);
    this.add({
      kind: 'box',
      x: px + lx * c + lz * s,
      z: pz - lx * s + lz * c,
      hw, hd, ry: pry, y0, y1, ...extra,
    });
  }

  private near(x: number, z: number, r: number, out: Set<Collider>) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (list) for (const c of list) out.add(c);
      }
    }
    return out;
  }

  private scratch = new Set<Collider>();

  /**
   * Resolve a cylinder at (x, y, z) with radius r and height h. Returns the corrected position and
   * the highest surface directly beneath the player (for standing/jumping).
   */
  resolve(pos: { x: number; y: number; z: number }, r: number, h: number, stepUp = 0.45): { ground: number } {
    let ground = 0;
    this.scratch.clear();
    const list = this.near(pos.x, pos.z, r + 1, this.scratch);
    for (let iter = 0; iter < 3; iter++) {
      for (const c of list) {
        // Can we stand on it? (top within step height of our feet)
        if (pos.y + stepUp >= c.y1 && !c.noStand) {
          if (this.overlapsXZ(c, pos.x, pos.z, r * 0.6)) ground = Math.max(ground, c.y1);
          continue;
        }
        if (pos.y + h <= c.y0) continue; // we're entirely below it
        this.pushOut(c, pos, r);
      }
    }
    // World boundary
    const d = Math.hypot(pos.x, pos.z);
    if (d > this.radius) {
      pos.x = (pos.x / d) * this.radius;
      pos.z = (pos.z / d) * this.radius;
    }
    return { ground };
  }

  private overlapsXZ(c: Collider, x: number, z: number, r: number): boolean {
    if (c.kind === 'circle') return Math.hypot(x - c.x, z - c.z) < c.r + r;
    const dx = x - c.x, dz = z - c.z;
    const cs = Math.cos(c.ry), sn = Math.sin(c.ry);
    const lx = dx * cs - dz * sn;
    const lz = dx * sn + dz * cs;
    return Math.abs(lx) < c.hw + r && Math.abs(lz) < c.hd + r;
  }

  private pushOut(c: Collider, pos: { x: number; z: number }, r: number) {
    if (c.kind === 'circle') {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + r;
      if (d < min && d > 1e-6) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
      return;
    }
    const cs = Math.cos(c.ry), sn = Math.sin(c.ry);
    const dx = pos.x - c.x, dz = pos.z - c.z;
    let lx = dx * cs - dz * sn;
    let lz = dx * sn + dz * cs;
    // Closest point on the box to the circle centre (in local space)
    const qx = Math.max(-c.hw, Math.min(c.hw, lx));
    const qz = Math.max(-c.hd, Math.min(c.hd, lz));
    let ox = lx - qx, oz = lz - qz;
    const d = Math.hypot(ox, oz);
    if (d >= r) return;
    if (d > 1e-6) {
      lx = qx + (ox / d) * r;
      lz = qz + (oz / d) * r;
    } else {
      // Centre is inside the box: push out along the shallowest axis.
      const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
      if (px < pz) lx = Math.sign(lx || 1) * (c.hw + r);
      else lz = Math.sign(lz || 1) * (c.hd + r);
      ox = oz = 0;
    }
    // back to world
    pos.x = c.x + lx * cs + lz * sn;
    pos.z = c.z - lx * sn + lz * cs;
  }

  /**
   * March a ray from (ox,oy,oz) towards (tx,ty,tz); returns the fraction [0..1] of the first
   * camera-blocking hit. Used to pull the third-person camera in front of walls.
   */
  raycastCamera(ox: number, oy: number, oz: number, tx: number, ty: number, tz: number): number {
    const len = Math.hypot(tx - ox, ty - oy, tz - oz);
    const steps = Math.ceil(len / 0.25);
    this.scratch.clear();
    const list = this.near((ox + tx) / 2, (oz + tz) / 2, len / 2 + 1, this.scratch);
    const blockers = [...list].filter((c) => c.camera);
    if (!blockers.length) return 1;
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const x = ox + (tx - ox) * f, y = oy + (ty - oy) * f, z = oz + (tz - oz) * f;
      for (const c of blockers) {
        if (y < c.y0 || y > c.y1) continue;
        if (this.overlapsXZ(c, x, z, 0.15)) return Math.max(0, (i - 1) / steps);
      }
    }
    return 1;
  }
}
