import { createRng, hashString, type Rng } from './rng.ts';
import type {
  CreekLayout, HouseColors, HouseLayout, HouseStyle, PathSegment, PlazaLayout, Prop, PropType,
  TownInput, TownLayout, WorldInput, WorldLayout,
} from './layout.ts';

/**
 * Deterministic world generator.
 *
 * Positions depend only on (guildId, town slot, building slot, town capacity) — never on how many
 * buildings currently exist — so adding or removing a channel never shuffles other houses around.
 * The server persists slots; every client runs this same function and gets the same world.
 */

const HUB_RADIUS = 16;
const PLAZA_RADIUS = 9;
const FIRST_RING_OFFSET = 14; // plaza edge → first ring of houses
const RING_SPACING = 16;
const ARC_SPACING = 15; // metres between neighbouring house centres along a ring
const TOWN_GAP = 22;
const HOUSE_DEPTH_MAX = 8;

const PALETTES: HouseColors[] = [
  { wall: '#f3e3c3', roof: '#c8553d', trim: '#7a4e2d', door: '#5b8c5a' },
  { wall: '#e8d6f0', roof: '#6a5acd', trim: '#f4f1ea', door: '#d98c5f' },
  { wall: '#d4ecd9', roof: '#3f7d5a', trim: '#6b4a32', door: '#e3a53c' },
  { wall: '#fbe3d6', roof: '#e07a5f', trim: '#81584a', door: '#3d5a80' },
  { wall: '#f6f0d8', roof: '#4f86c6', trim: '#8a5a44', door: '#c8553d' },
  { wall: '#e9dcc9', roof: '#8c5e58', trim: '#5c3d2e', door: '#7cc47f' },
  { wall: '#dfe7f2', roof: '#d4a24c', trim: '#5f6f8f', door: '#9b7fd6' },
  { wall: '#f7d9c4', roof: '#5b8c5a', trim: '#7b5b3a', door: '#ef6f6c' },
];

const STYLE_DIMS: Record<HouseStyle, { w: number; d: number; h: number }> = {
  cottage: { w: 8, d: 7, h: 3.5 },
  tall: { w: 7, d: 7, h: 6 },
  longhouse: { w: 11, d: 7, h: 3.5 },
  shop: { w: 9, d: 8, h: 4 },
  tower: { w: 7, d: 7, h: 7.5 },
};

const TEXT_STYLES: HouseStyle[] = ['cottage', 'cottage', 'tall', 'longhouse', 'shop'];

/** Round a town's reserved capacity up so small growth doesn't change its footprint. */
export function townCapacity(maxSlot: number, count: number): number {
  const need = Math.max(maxSlot + 1, count) + 3;
  return Math.max(6, Math.ceil(need / 6) * 6);
}

interface Ring {
  radius: number;
  capacity: number;
  gateHalf: number;
}

function ringRadius(i: number): number {
  return PLAZA_RADIUS + FIRST_RING_OFFSET + i * RING_SPACING;
}

function gateHalfAngle(r: number): number {
  return Math.asin(Math.min(1, 9 / r));
}

function ringCapacity(r: number): number {
  const half = gateHalfAngle(r);
  return Math.max(3, Math.floor(((Math.PI * 2 - half * 2) * r) / ARC_SPACING));
}

function planRings(capacity: number): Ring[] {
  const rings: Ring[] = [];
  let total = 0;
  for (let i = 0; total < capacity; i++) {
    const radius = ringRadius(i);
    const cap = ringCapacity(radius);
    rings.push({ radius, capacity: cap, gateHalf: gateHalfAngle(radius) });
    total += cap;
  }
  return rings;
}

export function townRadiusFor(capacity: number): number {
  const rings = planRings(capacity);
  return rings[rings.length - 1]!.radius + HOUSE_DEPTH_MAX / 2 + 6;
}

function slotToRing(rings: Ring[], slot: number): { ring: number; index: number } {
  let s = slot;
  for (let i = 0; i < rings.length; i++) {
    const cap = rings[i]!.capacity;
    if (s < cap) return { ring: i, index: s };
    s -= cap;
  }
  // Beyond reserved capacity (shouldn't happen — server reserves ahead). Wrap onto the last ring.
  const last = rings.length - 1;
  return { ring: last, index: s % rings[last]!.capacity };
}

/** Distance from point to segment. */
export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

/** Rotation that makes local +Z face from (x,z) toward (tx,tz). */
function facing(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(tx - x, tz - z);
}

interface PlacedTown {
  x: number;
  z: number;
  r: number;
}

function placeTowns(inputs: { slot: number; radius: number }[], seed: number): PlacedTown[] {
  const placed: PlacedTown[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const angle0 = (seed % 6283) / 1000;
  for (const t of inputs) {
    const angle = angle0 + t.slot * golden;
    let dist = HUB_RADIUS + t.radius + 26;
    for (let attempt = 0; attempt < 400; attempt++, dist += 6) {
      // Nudge the angle a little as we go outward so we can slip between neighbours.
      const a = angle + Math.sin(attempt * 0.7) * 0.25;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      const ok = placed.every((p) => {
        if (Math.hypot(p.x - x, p.z - z) < p.r + t.radius + TOWN_GAP) return false;
        // Our main road must not cut through an existing town, and theirs must not cut through us.
        if (distToSegment(p.x, p.z, 0, 0, x, z) < p.r + 6) return false;
        if (distToSegment(x, z, 0, 0, p.x, p.z) < t.radius + 6) return false;
        return true;
      });
      if (ok) {
        placed.push({ x, z, r: t.radius });
        break;
      }
    }
    if (placed.length < inputs.indexOf(t) + 1) {
      // Pathological fallback: push far out.
      placed.push({ x: Math.cos(angle) * (dist + 100), z: Math.sin(angle) * (dist + 100), r: t.radius });
    }
  }
  return placed;
}

/** Simple smooth value noise used to cluster forests. */
function valueNoise(seed: number) {
  const lattice = (ix: number, iz: number) => (hashString(`${ix},${iz}`, seed) % 10007) / 10007;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, z: number) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = smooth(x - ix);
    const fz = smooth(z - iz);
    const a = lattice(ix, iz);
    const b = lattice(ix + 1, iz);
    const c = lattice(ix, iz + 1);
    const d = lattice(ix + 1, iz + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
}

/** Uniform-grid bucket of path segments for fast "am I near a path?" queries. */
class SegmentGrid {
  private cells = new Map<string, PathSegment[]>();
  constructor(private cell = 16) {}
  add(s: PathSegment) {
    const pad = s.width;
    const x0 = Math.floor((Math.min(s.ax, s.bx) - pad) / this.cell);
    const x1 = Math.floor((Math.max(s.ax, s.bx) + pad) / this.cell);
    const z0 = Math.floor((Math.min(s.az, s.bz) - pad) / this.cell);
    const z1 = Math.floor((Math.max(s.az, s.bz) + pad) / this.cell);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = `${x},${z}`;
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(s);
      }
    }
  }
  near(x: number, z: number, margin: number): boolean {
    const list = this.cells.get(`${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`);
    if (!list) return false;
    return list.some((s) => distToSegment(x, z, s.ax, s.az, s.bx, s.bz) < s.width / 2 + margin);
  }
}

function pushProp(props: Prop[], t: PropType, x: number, z: number, rng: Rng, extra: Partial<Prop> = {}) {
  props.push({ t, x, z, ry: rng.range(0, Math.PI * 2), s: rng.range(0.85, 1.2), v: rng.int(0, 7), ...extra });
}

export function generateWorld(input: WorldInput): WorldLayout {
  const seed = hashString(input.guildId);
  const worldRng = createRng(seed);

  const towns: TownLayout[] = [];
  const houses: HouseLayout[] = [];
  const plazas: PlazaLayout[] = [];
  const paths: PathSegment[] = [];
  const creeks: CreekLayout[] = [];
  const props: Prop[] = [];

  const sortedTowns = [...input.towns].sort((a, b) => a.slot - b.slot);
  const townRadii = sortedTowns.map((t) => townRadiusFor(t.capacity));
  const placed = placeTowns(sortedTowns.map((t, i) => ({ slot: t.slot, radius: townRadii[i]! })), seed);

  // ── Hub: central spawn square ──────────────────────────────────────────
  paths.push({ ax: 0, az: 0, bx: 0, bz: 0, width: HUB_RADIUS * 2, kind: 'plaza' });
  {
    const rng = createRng(seed ^ 0x51);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const bx = Math.cos(a) * (HUB_RADIUS - 3);
      const bz = Math.sin(a) * (HUB_RADIUS - 3);
      props.push({ t: 'bench', x: bx, z: bz, ry: facing(bx, bz, 0, 0), s: 1, v: 0 });
      const lx = Math.cos(a + 0.5) * (HUB_RADIUS - 1.5);
      const lz = Math.sin(a + 0.5) * (HUB_RADIUS - 1.5);
      props.push({ t: 'lamp', x: lx, z: lz, ry: 0, s: 1, v: 0 });
    }
    for (let i = 0; i < 10; i++) {
      const a = rng.range(0, Math.PI * 2);
      pushProp(props, 'flower', Math.cos(a) * (HUB_RADIUS + 1.5), Math.sin(a) * (HUB_RADIUS + 1.5), rng);
    }
  }

  sortedTowns.forEach((tin, ti) => {
    const pos = placed[ti]!;
    const townSeed = hashString(`${input.guildId}:${tin.key}`);
    const rng = createRng(townSeed);
    const rings = planRings(tin.capacity);
    const gateAngle = Math.atan2(-pos.z, -pos.x);
    const palette = townSeed % PALETTES.length;
    const centerpieces = ['fountain', 'well', 'tree', 'bonfire'] as const;

    const town: TownLayout = {
      key: tin.key,
      name: tin.name,
      x: pos.x,
      z: pos.z,
      radius: pos.r,
      plazaRadius: PLAZA_RADIUS,
      gateAngle,
      palette,
      centerpiece: centerpieces[townSeed % centerpieces.length]!,
    };
    towns.push(town);

    // Town square
    paths.push({ ax: pos.x, az: pos.z, bx: pos.x, bz: pos.z, width: PLAZA_RADIUS * 2, kind: 'plaza' });

    // Main road: hub → town square, entering through the gate.
    const dist = Math.hypot(pos.x, pos.z);
    const ux = pos.x / dist;
    const uz = pos.z / dist;
    const roadStart = { x: ux * (HUB_RADIUS - 1), z: uz * (HUB_RADIUS - 1) };
    const roadEnd = { x: pos.x - ux * (PLAZA_RADIUS - 1), z: pos.z - uz * (PLAZA_RADIUS - 1) };
    paths.push({ ax: roadStart.x, az: roadStart.z, bx: roadEnd.x, bz: roadEnd.z, width: 3.2, kind: 'road' });

    // A creek with a bridge crossing the road between hub and town.
    const outsideLen = dist - HUB_RADIUS - pos.r;
    let creekAt = -1;
    if (outsideLen > 30) {
      creekAt = HUB_RADIUS + outsideLen * rng.range(0.4, 0.6);
      creeks.push({
        x: ux * creekAt,
        z: uz * creekAt,
        ry: Math.atan2(-uz, ux) + Math.PI / 2 + rng.range(-0.25, 0.25),
        length: rng.range(22, 30),
        width: 3.2,
        bridgeWidth: 4.2,
      });
    }

    // Lamps along the road
    const px = -uz;
    const pz = ux;
    let side = 1;
    for (let d = HUB_RADIUS + 6; d < dist - pos.r; d += 13) {
      if (creekAt > 0 && Math.abs(d - creekAt) < 6) continue;
      props.push({ t: 'lamp', x: ux * d + px * 2.6 * side, z: uz * d + pz * 2.6 * side, ry: 0, s: 1, v: 0 });
      side = -side;
    }

    // Signposts: one at the hub pointing to the town, one at the town gate.
    props.push({
      t: 'signpost', x: roadStart.x * 1.08 + px * 2.8, z: roadStart.z * 1.08 + pz * 2.8,
      ry: facing(0, 0, pos.x, pos.z) + Math.PI, s: 1, v: 0, label: tin.name,
    });
    const gateR = pos.r - 2;
    props.push({
      t: 'signpost',
      x: pos.x + Math.cos(gateAngle) * gateR + px * 3,
      z: pos.z + Math.sin(gateAngle) * gateR + pz * 3,
      ry: facing(pos.x, pos.z, 0, 0), s: 1.25, v: 1, label: tin.name,
    });

    // Plaza furniture
    for (let i = 0; i < 4; i++) {
      const a = gateAngle + Math.PI / 4 + (i * Math.PI) / 2;
      const bx = pos.x + Math.cos(a) * (PLAZA_RADIUS - 2.2);
      const bz = pos.z + Math.sin(a) * (PLAZA_RADIUS - 2.2);
      props.push({ t: 'bench', x: bx, z: bz, ry: facing(bx, bz, pos.x, pos.z), s: 1, v: 0 });
      props.push({
        t: 'lamp', x: pos.x + Math.cos(a + 0.4) * (PLAZA_RADIUS - 0.8),
        z: pos.z + Math.sin(a + 0.4) * (PLAZA_RADIUS - 0.8), ry: 0, s: 1, v: 0,
      });
    }

    // Ring roads (only rings that actually have something on them)
    const usedSlots = new Set(tin.buildings.map((b) => b.slot));
    const maxSlot = Math.max(-1, ...usedSlots);
    const lastUsedRing = maxSlot >= 0 ? slotToRing(rings, maxSlot).ring : 0;
    for (let ri = 0; ri <= lastUsedRing; ri++) {
      const ring = rings[ri]!;
      const roadR = ring.radius - HOUSE_DEPTH_MAX / 2 - 3.5;
      const segs = Math.max(12, Math.ceil((Math.PI * 2 * roadR) / 7));
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * Math.PI * 2;
        const a1 = ((s + 1) / segs) * Math.PI * 2;
        paths.push({
          ax: pos.x + Math.cos(a0) * roadR, az: pos.z + Math.sin(a0) * roadR,
          bx: pos.x + Math.cos(a1) * roadR, bz: pos.z + Math.sin(a1) * roadR,
          width: 2.4, kind: 'lane',
        });
      }
      // Spokes linking this ring road to the one inside it (or the plaza).
      const innerR = ri === 0 ? PLAZA_RADIUS - 0.5 : rings[ri - 1]!.radius - HOUSE_DEPTH_MAX / 2 - 3.5;
      for (let k = 1; k < 4; k++) {
        const a = gateAngle + (k * Math.PI) / 2 + (ri % 2) * (Math.PI / 4);
        paths.push({
          ax: pos.x + Math.cos(a) * innerR, az: pos.z + Math.sin(a) * innerR,
          bx: pos.x + Math.cos(a) * roadR, bz: pos.z + Math.sin(a) * roadR,
          width: 2.2, kind: 'lane',
        });
      }
    }

    // Buildings
    const buildingBySlot = new Map(tin.buildings.map((b) => [b.slot, b]));
    const slotCount = rings.slice(0, lastUsedRing + 1).reduce((n, r) => n + r.capacity, 0);
    for (let slot = 0; slot < slotCount; slot++) {
      const { ring: ri, index } = slotToRing(rings, slot);
      const ring = rings[ri]!;
      const srng = createRng(townSeed ^ hashString(`slot${slot}`));
      const span = Math.PI * 2 - ring.gateHalf * 2;
      const step = span / ring.capacity;
      const angle = gateAngle + ring.gateHalf + (index + 0.5) * step + srng.range(-0.12, 0.12) * step;
      const r = ring.radius + srng.range(-1.2, 1.2);
      const x = pos.x + Math.cos(angle) * r;
      const z = pos.z + Math.sin(angle) * r;
      const ry = facing(x, z, pos.x, pos.z);
      const b = buildingBySlot.get(slot);
      const roadR = ring.radius - HOUSE_DEPTH_MAX / 2 - 3.5;

      if (!b) {
        // Empty slot: a little garden or grove so towns don't look gap-toothed.
        const roll = srng();
        if (roll < 0.45) {
          for (let i = 0; i < 3; i++) {
            pushProp(props, srng.chance(0.5) ? 'tree' : 'birch', x + srng.range(-3, 3), z + srng.range(-3, 3), srng);
          }
        } else if (roll < 0.8) {
          for (let i = 0; i < 7; i++) pushProp(props, 'flower', x + srng.range(-3, 3), z + srng.range(-3, 3), srng);
          pushProp(props, srng.chance(0.5) ? 'haybale' : 'bush', x, z, srng);
        }
        continue;
      }

      if (b.kind === 'voice') {
        plazas.push({
          channelId: b.channelId, townKey: tin.key, name: b.name, active: b.active,
          x, z, ry, radius: 4.5,
        });
        const dx = pos.x + Math.cos(angle) * roadR;
        const dz = pos.z + Math.sin(angle) * roadR;
        paths.push({ ax: x, az: z, bx: dx, bz: dz, width: 2, kind: 'lane', channelId: b.channelId });
        continue;
      }

      const style: HouseStyle = b.kind === 'announcement'
        ? 'tower'
        : TEXT_STYLES[hashString(b.channelId) % TEXT_STYLES.length]!;
      const dims = STYLE_DIMS[style];
      const colors = PALETTES[(palette + (hashString(b.channelId) % 3)) % PALETTES.length]!;
      const house: HouseLayout = {
        channelId: b.channelId, townKey: tin.key, name: b.name,
        kind: b.kind, active: b.active, topic: b.topic ?? null,
        x, z, ry, w: dims.w, d: dims.d, h: dims.h, style, colors,
      };
      houses.push(house);

      // Lane from the door to the ring road.
      const fx = Math.sin(ry);
      const fz = Math.cos(ry);
      const doorX = x + fx * (dims.d / 2);
      const doorZ = z + fz * (dims.d / 2);
      const laneEndX = pos.x + Math.cos(angle) * roadR;
      const laneEndZ = pos.z + Math.sin(angle) * roadR;
      paths.push({ ax: doorX, az: doorZ, bx: laneEndX, bz: laneEndZ, width: 1.6, kind: 'lane', channelId: b.channelId });

      // Front garden decoration
      const rx = Math.cos(ry);
      const rz = -Math.sin(ry);
      for (let i = 0; i < 4; i++) {
        const sideSign = i % 2 === 0 ? 1 : -1;
        const off = srng.range(1.6, dims.w / 2 - 0.4) * sideSign;
        pushProp(props, 'flower', doorX + rx * off + fx * srng.range(0.4, 1.4), doorZ + rz * off + fz * srng.range(0.4, 1.4), srng, { channelId: b.channelId });
      }
      props.push({
        t: 'mailbox', x: doorX + rx * 1.6 + fx * 1.8, z: doorZ + rz * 1.6 + fz * 1.8,
        ry, s: 1, v: 0, channelId: b.channelId,
      });
      if (srng.chance(0.5)) {
        pushProp(props, srng.chance(0.5) ? 'barrel' : 'crate', x - rx * (dims.w / 2 + 1) + fx * 1.5, z - rz * (dims.w / 2 + 1) + fz * 1.5, srng, { channelId: b.channelId });
      }
      // Back-garden fence
      if (srng.chance(0.55)) {
        const backX = x - fx * (dims.d / 2 + 2.2);
        const backZ = z - fz * (dims.d / 2 + 2.2);
        const n = Math.round(dims.w / 2);
        for (let i = 0; i <= n; i++) {
          const off = -dims.w / 2 + (i * dims.w) / n;
          props.push({ t: 'fence', x: backX + rx * off, z: backZ + rz * off, ry, s: 1, v: 0, channelId: b.channelId });
        }
        pushProp(props, 'bush', backX + fx * 1.2, backZ + fz * 1.2, srng, { channelId: b.channelId });
      } else {
        pushProp(props, srng.chance(0.5) ? 'tree' : 'pine', x - fx * (dims.d / 2 + 3), z - fz * (dims.d / 2 + 3), srng, { channelId: b.channelId });
      }
    }
  });

  // ── World extent ───────────────────────────────────────────────────────
  const radius = Math.max(
    120,
    ...towns.map((t) => Math.hypot(t.x, t.z) + t.radius + 50),
  );

  // ── Wilderness scatter ────────────────────────────────────────────────
  const grid = new SegmentGrid();
  for (const p of paths) if (p.kind !== 'plaza') grid.add(p);
  const noise = valueNoise(seed);
  const cell = 6.5;
  const blocked = (x: number, z: number, margin: number) => {
    if (Math.hypot(x, z) < HUB_RADIUS + 5 + margin) return true;
    for (const t of towns) if (Math.hypot(x - t.x, z - t.z) < t.radius + margin) return true;
    if (grid.near(x, z, 1.8 + margin)) return true;
    for (const c of creeks) {
      const dx = x - c.x;
      const dz = z - c.z;
      const lx = dx * Math.cos(c.ry) - dz * Math.sin(c.ry);
      const lz = dx * Math.sin(c.ry) + dz * Math.cos(c.ry);
      if (Math.abs(lx) < c.length / 2 + 2 && Math.abs(lz) < c.width / 2 + 2 + margin) return true;
    }
    return false;
  };
  for (let gx = -radius; gx < radius; gx += cell) {
    for (let gz = -radius; gz < radius; gz += cell) {
      const x = gx + worldRng.range(0, cell);
      const z = gz + worldRng.range(0, cell);
      const d = Math.hypot(x, z);
      if (d > radius - 4) continue;
      const density = noise(x / 45, z / 45);
      const edge = Math.max(0, (d - (radius - 40)) / 40); // denser forest at the world's rim
      const roll = worldRng();
      if (roll < density * 0.75 + edge) {
        if (blocked(x, z, 1)) continue;
        const kind: PropType = density > 0.62 ? 'pine' : worldRng.chance(0.25) ? 'birch' : 'tree';
        pushProp(props, kind, x, z, worldRng);
      } else if (roll > 0.93) {
        if (blocked(x, z, 0)) continue;
        const kind = worldRng.pick(['flower', 'flower', 'flower', 'rock', 'mushroom', 'bush', 'stump'] as const);
        pushProp(props, kind, x, z, worldRng);
        if (kind === 'flower') {
          for (let i = 0; i < 4; i++) pushProp(props, 'flower', x + worldRng.range(-2, 2), z + worldRng.range(-2, 2), worldRng);
        }
      }
    }
  }

  return {
    guildId: input.guildId,
    seed,
    radius,
    spawn: { x: 0, z: 4, ry: Math.PI },
    hub: { x: 0, z: 0, radius: HUB_RADIUS },
    towns,
    houses,
    plazas,
    paths,
    creeks,
    props,
  };
}
