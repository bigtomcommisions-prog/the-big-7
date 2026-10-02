import * as THREE from 'three';
import type { HouseLayout, PlazaLayout } from '@hearthvale/shared';
import type { CollisionWorld } from '../collision.ts';
import { VoxelBuilder, materials, shadeHex } from '../voxel.ts';
import { signBoard } from './text.ts';

const T = 0.4; // wall thickness
const DOOR_W = 1.8;
const DOOR_H = 2.6;

export interface BuiltHouse {
  group: THREE.Group;
  /** Hidden while the local player is inside so the camera can see in. */
  roof: THREE.Object3D;
  /** World-space point above the roof for the floating label. */
  labelPos: THREE.Vector3;
  /** World-space point just outside the door. */
  door: THREE.Vector3;
  /** World-space position of a lantern (glow). */
  lights: THREE.Vector3[];
}

const GREY: HouseLayout['colors'] = { wall: '#b9b2a8', roof: '#7d756c', trim: '#6b625a', door: '#5a534c' };

function roofSteps(b: VoxelBuilder, style: HouseLayout['style'], w: number, d: number, y: number, c: HouseLayout['colors']) {
  const ow = w + 1.0;
  const od = d + 1.0;
  if (style === 'shop') {
    b.box(0, y + 0.15, 0, ow, 0.3, od, c.roof);
    b.box(0, y + 0.5, od / 2 - 0.15, ow, 0.4, 0.3, c.trim);
    b.box(0, y + 0.5, -od / 2 + 0.15, ow, 0.4, 0.3, c.trim);
    b.box(ow / 2 - 0.15, y + 0.5, 0, 0.3, 0.4, od, c.trim);
    b.box(-ow / 2 + 0.15, y + 0.5, 0, 0.3, 0.4, od, c.trim);
    return y + 0.7;
  }
  if (style === 'tower' || style === 'tall') {
    const steps = style === 'tower' ? 7 : 5;
    const sh = style === 'tower' ? 0.55 : 0.45;
    for (let i = 0; i < steps; i++) {
      const f = 1 - i / steps;
      b.box(0, y + i * sh + sh / 2, 0, Math.max(0.5, ow * f), sh, Math.max(0.5, od * f), i % 2 ? shadeHex(c.roof, 0.9) : c.roof);
    }
    return y + steps * sh;
  }
  // Gable: ridge runs along X (left-right as you face the door).
  const steps = 5;
  const sh = 0.4;
  for (let i = 0; i < steps; i++) {
    const f = 1 - i / steps;
    b.box(0, y + i * sh + sh / 2, 0, ow, sh, Math.max(0.6, od * f), i % 2 ? shadeHex(c.roof, 0.9) : c.roof);
  }
  b.box(0, y + steps * sh + 0.1, 0, ow + 0.1, 0.2, 0.5, c.trim);
  // gable ends (fill triangle under roof)
  for (let i = 0; i < steps - 1; i++) {
    const f = 1 - (i + 1) / steps;
    b.box(w / 2 - T / 2, y + i * sh + sh / 2, 0, T, sh, Math.max(0.4, d * f), c.wall);
    b.box(-w / 2 + T / 2, y + i * sh + sh / 2, 0, T, sh, Math.max(0.4, d * f), c.wall);
  }
  return y + steps * sh;
}

function windowAt(b: VoxelBuilder, x: number, y: number, z: number, alongX: boolean, trim: string) {
  const glass = '#bfe6f5';
  if (alongX) {
    b.box(x, y, z, 1.1, 1.0, T + 0.06, glass);
    b.box(x, y + 0.55, z, 1.3, 0.12, T + 0.14, trim);
    b.box(x, y - 0.55, z, 1.3, 0.14, T + 0.2, trim);
    b.box(x, y, z, 0.08, 1.0, T + 0.1, trim);
  } else {
    b.box(x, y, z, T + 0.06, 1.0, 1.1, glass);
    b.box(x, y + 0.55, z, T + 0.14, 0.12, 1.3, trim);
    b.box(x, y - 0.55, z, T + 0.2, 0.14, 1.3, trim);
    b.box(x, y, z, T + 0.1, 1.0, 0.08, trim);
  }
}

/**
 * Build a channel house. Local frame: centred on (0,0), door on the +Z wall.
 * Adds wall/furniture colliders to `collision` in world space.
 */
export function buildHouse(h: HouseLayout, collision: CollisionWorld): BuiltHouse {
  const c = h.active ? h.colors : GREY;
  const { w, d } = h;
  const H = h.h;
  const seed = Math.abs([...h.channelId].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7)) + 1;
  const walls = new VoxelBuilder(0.035, seed);
  const roofB = new VoxelBuilder(0.03, seed + 1);

  // Foundation + floor
  walls.box(0, 0.12, 0, w + 0.3, 0.24, d + 0.3, '#a39a8f');
  walls.box(0, 0.26, 0, w - T * 2, 0.04, d - T * 2, '#b88a5a');
  for (let x = -w / 2 + T + 0.5; x < w / 2 - T; x += 1) walls.box(x, 0.285, 0, 0.04, 0.01, d - T * 2, '#9c7048');

  // Walls (front wall has a door gap)
  const side = (w - DOOR_W) / 2;
  walls.box(-w / 2 + side / 2, H / 2, d / 2 - T / 2, side, H, T, c.wall);
  walls.box(w / 2 - side / 2, H / 2, d / 2 - T / 2, side, H, T, c.wall);
  walls.box(0, (DOOR_H + H) / 2, d / 2 - T / 2, DOOR_W, H - DOOR_H, T, c.wall);
  walls.box(0, H / 2, -d / 2 + T / 2, w, H, T, c.wall);
  walls.box(-w / 2 + T / 2, H / 2, 0, T, H, d, c.wall);
  walls.box(w / 2 - T / 2, H / 2, 0, T, H, d, c.wall);
  // Corner posts & beams (timber frame look)
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    walls.box((x * w) / 2, H / 2, (z * d) / 2, 0.5, H + 0.05, 0.5, c.trim);
  }
  walls.box(0, H - 0.1, d / 2, w + 0.1, 0.25, 0.1, c.trim);
  walls.box(0, H - 0.1, -d / 2, w + 0.1, 0.25, 0.1, c.trim);
  if (H > 5) {
    walls.box(0, H / 2, d / 2 + 0.02, w, 0.22, 0.1, c.trim);
    walls.box(0, H / 2, -d / 2 - 0.02, w, 0.22, 0.1, c.trim);
  }
  // Door frame + open door leaf
  walls.box(-DOOR_W / 2 - 0.1, DOOR_H / 2, d / 2, 0.2, DOOR_H, T + 0.1, c.trim);
  walls.box(DOOR_W / 2 + 0.1, DOOR_H / 2, d / 2, 0.2, DOOR_H, T + 0.1, c.trim);
  walls.box(0, DOOR_H + 0.1, d / 2, DOOR_W + 0.4, 0.2, T + 0.1, c.trim);
  if (h.active) {
    walls.box(-DOOR_W / 2 + 0.08, DOOR_H / 2 - 0.05, d / 2 + 0.75, 0.12, DOOR_H - 0.1, DOOR_W * 0.8, c.door);
  } else {
    // Boarded up
    for (let i = 0; i < 3; i++) walls.box(0, 0.7 + i * 0.75, d / 2 + 0.05, DOOR_W + 0.3, 0.22, 0.08, '#8b6b4a', { z: (i - 1) * 0.25 });
  }
  // Step
  walls.box(0, 0.08, d / 2 + 0.45, DOOR_W + 0.6, 0.16, 0.7, '#a39a8f');

  // Windows
  const winY = 1.7;
  windowAt(walls, -w / 2 + side / 2 - 0.1, winY, d / 2 - T / 2, true, c.trim);
  windowAt(walls, w / 2 - side / 2 + 0.1, winY, d / 2 - T / 2, true, c.trim);
  windowAt(walls, -w / 2 + T / 2, winY, 0, false, c.trim);
  windowAt(walls, w / 2 - T / 2, winY, 0, false, c.trim);
  if (w > 9) windowAt(walls, 0, winY, -d / 2 + T / 2, true, c.trim);
  if (H > 5) {
    for (const x of [-w / 4, w / 4]) windowAt(walls, x, H * 0.75, d / 2 - T / 2, true, c.trim);
    windowAt(walls, -w / 2 + T / 2, H * 0.75, 0, false, c.trim);
    windowAt(walls, w / 2 - T / 2, H * 0.75, 0, false, c.trim);
  }
  // Window boxes with flowers
  if (h.active) {
    for (const x of [-w / 2 + side / 2 - 0.1, w / 2 - side / 2 + 0.1]) {
      walls.box(x, winY - 0.75, d / 2 + 0.1, 1.2, 0.25, 0.35, c.trim);
      for (let i = 0; i < 4; i++) walls.box(x - 0.45 + i * 0.3, winY - 0.55, d / 2 + 0.1, 0.18, 0.18, 0.18, ['#ff8fb1', '#ffe066', '#ff6f59', '#c8a2ff'][i]!);
    }
  }

  // Style extras
  if (h.style === 'shop' && h.active) {
    // Striped awning over the front
    for (let i = 0; i < 8; i++) {
      const x = -w / 2 + (i + 0.5) * (w / 8);
      walls.box(x, DOOR_H + 0.55, d / 2 + 0.8, w / 8, 0.12, 1.6, i % 2 ? '#ffffff' : c.door, { x: 0.35 });
    }
    walls.box(w / 2 - 1.2, 0.45, d / 2 + 1.4, 1.6, 0.9, 0.6, c.trim);
    walls.box(w / 2 - 1.5, 1.0, d / 2 + 1.4, 0.3, 0.2, 0.3, '#e25d5d');
    walls.box(w / 2 - 0.9, 1.0, d / 2 + 1.4, 0.3, 0.2, 0.3, '#ffe066');
  }

  // ── Interior ────────────────────────────────────────────────────────
  const rug = h.active ? c.door : '#8f877d';
  walls.box(0, 0.3, 0.3, Math.min(w - 2, 4), 0.02, Math.min(d - 2, 3), rug);
  walls.box(0, 0.31, 0.3, Math.min(w - 2.4, 3.6), 0.02, Math.min(d - 2.4, 2.6), shadeHex(rug, 1.25));
  // Table + stools
  walls.box(0, 0.75, -d / 2 + 2, 1.8, 0.12, 1.0, '#9c6b43');
  for (const x of [-0.75, 0.75]) walls.box(x, 0.4, -d / 2 + 2, 0.12, 0.7, 0.12, '#7b5234');
  for (const x of [-1.3, 1.3]) walls.box(x, 0.3, -d / 2 + 2, 0.5, 0.5, 0.5, '#b07d52');
  // Bookshelf on the back wall
  walls.box(-w / 2 + 1.4, 1.1, -d / 2 + T + 0.3, 1.6, 2.0, 0.5, '#7b5234');
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 5; i++) {
      walls.box(-w / 2 + 0.85 + i * 0.28, 0.55 + r * 0.6, -d / 2 + T + 0.45, 0.2, 0.4, 0.3, ['#c8553d', '#4f86c6', '#e3a53c', '#5fa464', '#9b7fd6'][(i + r) % 5]!);
    }
  }
  // Fireplace (cottages & longhouses) or a potted plant
  if (h.style === 'cottage' || h.style === 'longhouse') {
    walls.box(w / 2 - 1.2, 0.8, -d / 2 + T + 0.45, 1.6, 1.6, 0.7, '#8e8a84');
    walls.box(w / 2 - 1.2, 0.5, -d / 2 + T + 0.7, 0.9, 0.6, 0.3, '#3b2f28');
    if (h.active) walls.box(w / 2 - 1.2, 0.45, -d / 2 + T + 0.75, 0.5, 0.3, 0.2, '#ff9d3c');
  } else {
    walls.box(w / 2 - 1.1, 0.35, -d / 2 + T + 0.6, 0.6, 0.6, 0.6, '#b8704f');
    walls.box(w / 2 - 1.1, 1.0, -d / 2 + T + 0.6, 0.9, 0.8, 0.9, '#5fa464');
  }

  // Roof
  const roofTop = roofSteps(roofB, h.style, w, d, H, c);
  if (h.style === 'cottage' || h.style === 'longhouse') {
    roofB.box(w / 2 - 1.2, H + 1.2, -d / 4, 0.7, 2.0, 0.7, '#8e8a84');
    roofB.box(w / 2 - 1.2, H + 2.25, -d / 4, 0.85, 0.2, 0.85, '#6f6b66');
  }
  if (h.style === 'tower') {
    roofB.box(0, roofTop + 0.9, 0, 0.1, 1.8, 0.1, '#6b4a32');
    roofB.box(0.45, roofTop + 1.5, 0, 0.8, 0.5, 0.05, h.active ? c.door : '#8f877d');
  }

  const group = new THREE.Group();
  const wallMesh = new THREE.Mesh(walls.build(), materials.voxel);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);
  const roof = new THREE.Mesh(roofB.build(), materials.voxel);
  roof.castShadow = true;
  group.add(roof);

  // Channel name sign above the door
  const signText = h.active ? `# ${h.name}` : 'closed';
  const sign = signBoard(signText, Math.min(w - 1, 4.2), 0.8, { bg: h.active ? '#6b4a32' : '#6f6760', fg: '#fff6e5', border: '#4a3222' });
  sign.position.set(0, DOOR_H + 0.75, d / 2 + 0.12);
  group.add(sign);
  // Interior welcome board (visible from inside)
  const board = signBoard(signText, 2.4, 0.6, { bg: '#4a6b4a', fg: '#fff6e5', border: '#6b4a32' });
  board.position.set(0.9, 2.1, -d / 2 + T + 0.06);
  group.add(board);

  group.position.set(h.x, 0, h.z);
  group.rotation.y = h.ry;

  // Colliders (world space)
  const add = (lx: number, lz: number, hw: number, hd: number, y0: number, y1: number, camera = true) =>
    collision.addLocalBox(h.x, h.z, h.ry, lx, lz, hw, hd, y0, y1, { camera, noStand: camera });
  add(-w / 2 + side / 2, d / 2 - T / 2, side / 2, T / 2, 0, H);
  add(w / 2 - side / 2, d / 2 - T / 2, side / 2, T / 2, 0, H);
  add(0, d / 2 - T / 2, DOOR_W / 2, T / 2, DOOR_H, H);
  add(0, -d / 2 + T / 2, w / 2, T / 2, 0, H);
  add(-w / 2 + T / 2, 0, T / 2, d / 2, 0, H);
  add(w / 2 - T / 2, 0, T / 2, d / 2, 0, H);
  if (!h.active) add(0, d / 2, DOOR_W / 2, 0.2, 0, DOOR_H, false);
  add(0, -d / 2 + 2, 0.9, 0.5, 0, 0.81, false); // table
  add(-w / 2 + 1.4, -d / 2 + T + 0.3, 0.8, 0.25, 0, 2.1, false); // bookshelf
  add(w / 2 - 1.2, -d / 2 + T + 0.45, 0.8, 0.35, 0, 1.6, false); // fireplace / plant
  if (h.style === 'shop' && h.active) add(w / 2 - 1.2, d / 2 + 1.4, 0.8, 0.3, 0, 0.9, false);

  const toWorld = (lx: number, ly: number, lz: number) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), h.ry).add(new THREE.Vector3(h.x, 0, h.z));
  return {
    group,
    roof,
    labelPos: toWorld(0, roofTop + 1.2, 0),
    door: toWorld(0, 0, d / 2 + 1.2),
    lights: h.active ? [toWorld(-DOOR_W / 2 - 0.5, DOOR_H - 0.2, d / 2 + 0.3), toWorld(0, 1.1, -d / 2 + 2)] : [],
  };
}

/** Voice plaza: an open gazebo mapped to a Discord voice channel. */
export function buildGazebo(p: PlazaLayout, collision: CollisionWorld): { group: THREE.Group; labelPos: THREE.Vector3; seats: THREE.Vector3[] } {
  const b = new VoxelBuilder(0.03, 11);
  const r = p.radius;
  const roofB = new VoxelBuilder(0.03, 12);
  // Platform: stepped octagon approximated with boxes
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(Math.cos(a) * (r - 1.2), 0.15, Math.sin(a) * (r - 1.2), 2.6, 0.3, 2.6, '#cfc3b0', { y: -a });
  }
  b.box(0, 0.16, 0, r * 1.2, 0.3, r * 1.2, '#d8ccb8');
  const pillars: THREE.Vector3[] = [];
  const seats: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(a) * (r - 0.6), z = Math.sin(a) * (r - 0.6);
    b.box(x, 1.7, z, 0.35, 3.1, 0.35, '#f4f1ea');
    pillars.push(new THREE.Vector3(x, 0, z));
    if (i !== 1) {
      // bench between pillars (skip the entrance side)
      const a2 = a + Math.PI / 6;
      const bx = Math.cos(a2) * (r - 1.4), bz = Math.sin(a2) * (r - 1.4);
      b.box(bx, 0.55, bz, 1.6, 0.14, 0.5, '#9c6b43', { y: -a2 + Math.PI / 2 });
      seats.push(new THREE.Vector3(bx, 0.62, bz));
    }
  }
  // Roof: stacked, rotated rings
  for (let i = 0; i < 5; i++) {
    const s = (r + 0.6) * 2 * (1 - i / 5.5);
    roofB.box(0, 3.3 + i * 0.4, 0, s, 0.4, s, i % 2 ? '#8a9cf0' : '#6f7ee8', { y: Math.PI / 8 });
  }
  roofB.box(0, 5.5, 0, 0.3, 0.6, 0.3, '#ffd98a');

  const group = new THREE.Group();
  const m = new THREE.Mesh(b.build(), materials.voxel);
  m.castShadow = m.receiveShadow = true;
  const rm = new THREE.Mesh(roofB.build(), materials.voxel);
  rm.castShadow = true;
  group.add(m, rm);
  const sign = signBoard(p.name, 3.2, 0.7, { bg: '#4b57b8', fg: '#ffffff', border: '#39428c', icon: 'voice' });
  sign.position.set(0, 3.0, r - 0.4);
  group.add(sign);
  group.position.set(p.x, 0, p.z);
  group.rotation.y = p.ry;
  const up = new THREE.Vector3(0, 1, 0);
  for (const pl of pillars) {
    const wp = pl.clone().applyAxisAngle(up, p.ry).add(new THREE.Vector3(p.x, 0, p.z));
    collision.add({ kind: 'circle', x: wp.x, z: wp.z, r: 0.25, y0: 0, y1: 3.3, camera: true });
  }
  return {
    group,
    labelPos: new THREE.Vector3(p.x, 6.4, p.z),
    seats: seats.map((s) => s.applyAxisAngle(up, p.ry).add(new THREE.Vector3(p.x, 0, p.z))),
  };
}
