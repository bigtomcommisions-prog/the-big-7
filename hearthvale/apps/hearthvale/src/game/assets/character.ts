import * as THREE from 'three';
import type { Accessory, AnimState, Appearance } from '@hearthvale/shared';
import { VoxelBuilder, materials, shadeHex } from '../voxel.ts';

interface Proportions {
  legH: number; legW: number; torsoW: number; torsoH: number; torsoD: number; head: number; armW: number; armH: number;
}

const BODY: Record<Appearance['body'], Proportions> = {
  sprout: { legH: 0.55, legW: 0.22, torsoW: 0.6, torsoH: 0.58, torsoD: 0.38, head: 0.62, armW: 0.18, armH: 0.54 },
  sturdy: { legH: 0.55, legW: 0.26, torsoW: 0.74, torsoH: 0.62, torsoD: 0.46, head: 0.6, armW: 0.22, armH: 0.56 },
  lanky: { legH: 0.74, legW: 0.2, torsoW: 0.54, torsoH: 0.64, torsoD: 0.34, head: 0.56, armW: 0.17, armH: 0.62 },
  round: { legH: 0.46, legW: 0.26, torsoW: 0.8, torsoH: 0.6, torsoD: 0.56, head: 0.64, armW: 0.21, armH: 0.5 },
};

/** Colour of an accessory the character is wearing, or undefined if they aren't wearing it. */
const worn = (a: Appearance, kind: Accessory) => a.accessories.find((x) => x.kind === kind)?.color;

/** Hats that sit over the whole scalp, hiding spikes and buns underneath. */
const FULL_HATS: Accessory[] = ['beanie', 'strawhat', 'cap', 'wizardhat'];

function buildHead(a: Appearance, p: Proportions): THREE.BufferGeometry {
  const s = p.head;
  const b = new VoxelBuilder(0.02, 7);
  const hair = a.hairColor;
  /** A box spanning y0..y1 (easier to line up pieces than centre + height). */
  const span = (x: number, y0: number, y1: number, z: number, w: number, d: number, c: THREE.ColorRepresentation) => b.box(x, (y0 + y1) / 2, z, w, y1 - y0, d, c);

  // Head
  b.box(0, s / 2, 0, s, s, s, a.skin);

  // Face
  const fz = s / 2 + 0.005;
  const ink = '#2b2220';
  const patch = worn(a, 'eyepatch');
  for (const side of [-1, 1]) {
    if (side === 1 && patch) continue; // the patch covers this eye
    const x = side * s * 0.2;
    switch (a.face.eyes) {
      case 'round':
        b.box(x, s * 0.48, fz, 0.08, 0.12, 0.02, ink);
        b.box(x, s * 0.52, fz + 0.007, 0.03, 0.04, 0.01, '#ffffff');
        break;
      case 'happy': // ^ ^
        b.box(x, s * 0.52, fz, 0.06, 0.03, 0.02, ink);
        b.box(x - 0.04, s * 0.48, fz, 0.03, 0.06, 0.02, ink);
        b.box(x + 0.04, s * 0.48, fz, 0.03, 0.06, 0.02, ink);
        break;
      case 'sleepy':
        b.box(x, s * 0.46, fz, 0.1, 0.03, 0.02, ink);
        break;
      case 'none':
        break;
    }
  }
  if (a.face.cheeks) {
    b.box(-s * 0.33, s * 0.32, fz, 0.1, 0.05, 0.02, '#f29c9c');
    b.box(s * 0.33, s * 0.32, fz, 0.1, 0.05, 0.02, '#f29c9c');
  }
  const lip = shadeHex(a.skin, 0.5);
  switch (a.face.mouth) {
    case 'line':
      b.box(0, s * 0.28, fz, 0.1, 0.03, 0.02, shadeHex(a.skin, 0.65));
      break;
    case 'smile':
      b.box(0, s * 0.26, fz, 0.08, 0.03, 0.02, lip);
      b.box(-0.055, s * 0.29, fz, 0.03, 0.04, 0.02, lip);
      b.box(0.055, s * 0.29, fz, 0.03, 0.04, 0.02, lip);
      break;
    case 'open':
      b.box(0, s * 0.27, fz, 0.1, 0.07, 0.02, '#6e2a2a');
      b.box(0, s * 0.25, fz + 0.004, 0.06, 0.03, 0.02, '#e57373');
      break;
    case 'none':
      break;
  }

  // Hair. Every piece that hangs down reaches up to `root`, inside the cap, so there's no gap.
  const root = s + 0.02;
  const fullHat = a.accessories.some((x) => FULL_HATS.includes(x.kind));
  const cap = () => {
    span(0, s - 0.01, s + 0.13, 0, s + 0.08, s + 0.08, hair);
    span(0, s * 0.27, root, -s / 2 - 0.035, s + 0.08, 0.08, hair);
  };
  switch (a.hair) {
    case 'short':
      cap();
      span(0, s - 0.11, root, s / 2 + 0.03, s + 0.06, 0.06, hair);
      span(-s / 2 - 0.03, s * 0.55, root, 0, 0.07, s * 0.9, hair);
      span(s / 2 + 0.03, s * 0.55, root, 0, 0.07, s * 0.9, hair);
      break;
    case 'long':
      cap();
      span(0, -s * 0.2 - 0.075, root, -s / 2 - 0.05, s + 0.12, 0.12, hair);
      span(-s / 2 - 0.04, -s * 0.03, root, -0.02, 0.09, s * 0.95, hair);
      span(s / 2 + 0.04, -s * 0.03, root, -0.02, 0.09, s * 0.95, hair);
      span(-s * 0.18, s - 0.12, root, s / 2 + 0.03, s * 0.55, 0.06, hair);
      break;
    case 'spiky':
      cap();
      if (!fullHat) {
        for (let i = 0; i < 5; i++) {
          const x = (i - 2) * s * 0.2;
          b.box(x, s + 0.2, (i % 2) * 0.08 - 0.04, 0.14, 0.26, 0.14, hair, { z: (i - 2) * 0.25 });
        }
      }
      span(0, s - 0.09, root, s / 2 + 0.03, s + 0.04, 0.06, hair);
      break;
    case 'bun':
      cap();
      span(0, s - 0.1, root, s / 2 + 0.03, s + 0.06, 0.06, hair);
      if (!fullHat) b.box(0, s + 0.24, -0.12, 0.26, 0.24, 0.26, shadeHex(hair, 0.95));
      break;
    case 'bob':
      cap();
      span(-s / 2 - 0.04, s * 0.12, root, 0, 0.09, s + 0.06, hair);
      span(s / 2 + 0.04, s * 0.12, root, 0, 0.09, s + 0.06, hair);
      span(0, s - 0.16, root, s / 2 + 0.03, s + 0.1, 0.06, hair);
      break;
    case 'none':
      break;
  }

  // Head accessories
  const top = s + (a.hair === 'none' ? 0 : 0.13); // top of the scalp or hair
  let c: string | undefined;
  if ((c = worn(a, 'beanie'))) {
    b.box(0, s + 0.1, 0, s + 0.12, 0.26, s + 0.12, c);
    b.box(0, s - 0.02, 0, s + 0.14, 0.08, s + 0.14, shadeHex(c, 0.8));
    b.box(0, s + 0.3, 0, 0.14, 0.14, 0.14, '#ffffff');
  }
  if ((c = worn(a, 'crown'))) {
    const y = top + 0.01;
    b.box(0, y + 0.06, 0, s * 0.8, 0.12, s * 0.8, c);
    for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1], [0, 1]] as const) {
      b.box((x * s * 0.8) / 2.3, y + 0.18, (z * s * 0.8) / 2.3, 0.08, 0.14, 0.08, c);
    }
    b.box(0, y + 0.08, s * 0.4 + 0.01, 0.07, 0.07, 0.02, '#e25d5d');
  }
  if ((c = worn(a, 'strawhat'))) {
    b.box(0, s + 0.04, 0, s * 1.7, 0.06, s * 1.7, '#e8cf8a');
    b.box(0, s + 0.18, 0, s + 0.1, 0.26, s + 0.1, '#e8cf8a');
    b.box(0, s + 0.1, 0, s + 0.12, 0.07, s + 0.12, c);
  }
  if ((c = worn(a, 'cap'))) {
    b.box(0, s + 0.09, 0, s + 0.12, 0.2, s + 0.12, c);
    b.box(0, s + 0.01, s / 2 + 0.16, s + 0.02, 0.05, 0.3, shadeHex(c, 0.85));
    b.box(0, s + 0.21, 0, 0.08, 0.04, 0.08, shadeHex(c, 0.8));
  }
  if ((c = worn(a, 'wizardhat'))) {
    b.box(0, s + 0.06, 0, s * 1.55, 0.06, s * 1.55, c);
    b.box(0, s + 0.13, 0, s + 0.08, 0.08, s + 0.08, '#f2c14e');
    for (let i = 0; i < 5; i++) {
      const w = (s + 0.06) * (1 - i * 0.19);
      b.box(0, s + 0.24 + i * 0.13, -i * 0.035, w, 0.14, w, c, { x: -0.08 * i });
    }
    b.box(s * 0.2, s + 0.3, s * 0.36, 0.08, 0.08, 0.02, '#f2c14e');
  }
  if ((c = worn(a, 'catears'))) {
    for (const side of [-1, 1]) {
      b.box(side * s * 0.3, top + 0.08, -0.02, 0.18, 0.18, 0.08, c, { z: side * -0.35 });
      b.box(side * s * 0.3, top + 0.07, 0.025, 0.09, 0.1, 0.01, '#ffb6c8', { z: side * -0.35 });
    }
  }
  if ((c = worn(a, 'bow'))) {
    const x = -s * 0.22, y = top + 0.05, z = s * 0.05;
    b.box(x - 0.1, y, z, 0.14, 0.14, 0.08, c, { z: 0.25 });
    b.box(x + 0.1, y, z, 0.14, 0.14, 0.08, c, { z: -0.25 });
    b.box(x, y, z, 0.07, 0.08, 0.1, shadeHex(c, 0.8));
  }
  if ((c = worn(a, 'flower'))) {
    const sideHair = a.hair === 'bob' || a.hair === 'long' ? 0.09 : a.hair === 'short' ? 0.07 : 0;
    const cx = s / 2 + 0.02 + sideHair, cy = s * 0.88, cz = s * 0.15;
    b.box(cx, cy, cz, 0.08, 0.08, 0.08, '#ffe066');
    for (const [dy, dz] of [[0.09, 0], [-0.09, 0], [0, 0.09], [0, -0.09]] as const) b.box(cx, cy + dy, cz + dz, 0.07, 0.09, 0.09, c);
  }
  if ((c = worn(a, 'headphones'))) {
    b.box(0, top + 0.02, 0, s + 0.2, 0.07, 0.1, '#3a3a44');
    b.box(-s / 2 - 0.08, s * 0.5, 0, 0.12, 0.24, 0.24, c);
    b.box(s / 2 + 0.08, s * 0.5, 0, 0.12, 0.24, 0.24, c);
    span(-s / 2 - 0.08, s * 0.6, top + 0.02, 0, 0.06, 0.06, '#3a3a44');
    span(s / 2 + 0.08, s * 0.6, top + 0.02, 0, 0.06, 0.06, '#3a3a44');
  }
  if ((c = worn(a, 'glasses'))) {
    const z = s / 2 + 0.03;
    for (const x of [-s * 0.2, s * 0.2]) {
      b.box(x, s * 0.58, z, 0.2, 0.03, 0.02, c);
      b.box(x, s * 0.38, z, 0.2, 0.03, 0.02, c);
      b.box(x - 0.1, s * 0.48, z, 0.03, 0.2, 0.02, c);
      b.box(x + 0.1, s * 0.48, z, 0.03, 0.2, 0.02, c);
    }
    b.box(0, s * 0.52, z, 0.1, 0.03, 0.02, c);
  }
  if ((c = worn(a, 'sunglasses'))) {
    const z = s / 2 + 0.03;
    for (const x of [-s * 0.2, s * 0.2]) b.box(x, s * 0.47, z, 0.22, 0.14, 0.03, '#1d1d24');
    b.box(0, s * 0.55, z + 0.005, s * 0.72, 0.035, 0.03, c);
    for (const side of [-1, 1]) b.box(side * (s / 2 + 0.015), s * 0.55, s * 0.22, 0.02, 0.035, s * 0.56, c);
  }
  if ((c = worn(a, 'eyepatch'))) {
    b.box(s * 0.2, s * 0.48, fz + 0.02, 0.16, 0.16, 0.03, c);
    b.box(0, s * 0.64, 0, s + 0.03, 0.035, s + 0.03, shadeHex(c, 0.8));
  }
  if ((c = worn(a, 'mustache'))) {
    b.box(0, s * 0.35, fz + 0.01, 0.2, 0.06, 0.03, c);
    b.box(-0.12, s * 0.32, fz + 0.01, 0.06, 0.06, 0.03, c);
    b.box(0.12, s * 0.32, fz + 0.01, 0.06, 0.06, 0.03, c);
  }
  if ((c = worn(a, 'beard'))) {
    span(0, -0.06, s * 0.22, s / 2 + 0.03, s + 0.04, 0.08, c);
    for (const side of [-1, 1]) span(side * (s / 2 + 0.02), 0, s * 0.5, s * 0.12, 0.06, s * 0.7, c);
  }
  if ((c = worn(a, 'earrings'))) {
    for (const side of [-1, 1]) {
      b.box(side * (s / 2 + 0.025), s * 0.22, s * 0.05, 0.04, 0.06, 0.04, c);
      b.box(side * (s / 2 + 0.025), s * 0.12, s * 0.05, 0.06, 0.07, 0.06, shadeHex(c, 1.15));
    }
  }
  return b.build();
}

function buildTorso(a: Appearance, p: Proportions): THREE.BufferGeometry {
  const b = new VoxelBuilder(0.02, 3);
  b.box(0, p.torsoH / 2, 0, p.torsoW, p.torsoH, p.torsoD, a.shirt);
  b.box(0, 0.05, 0, p.torsoW + 0.02, 0.1, p.torsoD + 0.02, shadeHex(a.pants, 0.9)); // belt line
  b.box(0, p.torsoH * 0.62, p.torsoD / 2 + 0.01, 0.12, 0.12, 0.02, shadeHex(a.shirt, 0.8)); // pocket/badge
  const front = p.torsoD / 2;
  let c: string | undefined;
  if ((c = worn(a, 'scarf'))) {
    b.box(0, p.torsoH - 0.05, 0, p.torsoW + 0.06, 0.14, p.torsoD + 0.08, c);
    b.box(p.torsoW * 0.22, p.torsoH - 0.24, front + 0.05, 0.14, 0.3, 0.06, c);
  }
  if ((c = worn(a, 'necklace'))) {
    for (const side of [-1, 1]) b.box(side * 0.07, p.torsoH - 0.09, front + 0.012, 0.03, 0.17, 0.02, '#e8d27a', { z: side * 0.55 });
    b.box(0, p.torsoH - 0.2, front + 0.02, 0.08, 0.09, 0.03, c);
  }
  if ((c = worn(a, 'bowtie'))) {
    b.box(-0.07, p.torsoH - 0.07, front + 0.02, 0.11, 0.11, 0.04, c);
    b.box(0.07, p.torsoH - 0.07, front + 0.02, 0.11, 0.11, 0.04, c);
    b.box(0, p.torsoH - 0.07, front + 0.03, 0.06, 0.07, 0.05, shadeHex(c, 0.8));
  }
  if ((c = worn(a, 'backpack'))) {
    b.box(0, p.torsoH * 0.5, -front - 0.1, p.torsoW * 0.75, p.torsoH * 0.8, 0.2, c);
    b.box(0, p.torsoH * 0.74, -front - 0.205, p.torsoW * 0.72, p.torsoH * 0.3, 0.02, shadeHex(c, 0.85));
    for (const side of [-1, 1]) b.box(side * p.torsoW * 0.25, p.torsoH * 0.55, front + 0.01, 0.07, p.torsoH * 0.9, 0.02, shadeHex(c, 0.7));
  }
  if ((c = worn(a, 'cape'))) {
    const y0 = -p.legH * 0.75, y1 = p.torsoH;
    b.box(0, (y0 + y1) / 2, -front - 0.035, p.torsoW + 0.1, y1 - y0, 0.05, c);
    b.box(0, p.torsoH - 0.03, 0, p.torsoW + 0.1, 0.08, p.torsoD + 0.1, shadeHex(c, 0.85));
  }
  return b.build();
}

function buildArm(a: Appearance, p: Proportions): THREE.BufferGeometry {
  const b = new VoxelBuilder(0.02, 5);
  const sleeve = p.armH * 0.62;
  b.box(0, -sleeve / 2, 0, p.armW, sleeve, p.armW, a.shirt);
  b.box(0, -sleeve - (p.armH - sleeve) / 2, 0, p.armW * 0.92, p.armH - sleeve, p.armW * 0.92, a.skin);
  return b.build();
}

function buildLeg(a: Appearance, p: Proportions): THREE.BufferGeometry {
  const b = new VoxelBuilder(0.02, 9);
  const shoe = 0.14;
  b.box(0, -(p.legH - shoe) / 2, 0, p.legW, p.legH - shoe, p.legW, a.pants);
  b.box(0, -p.legH + shoe / 2, 0.03, p.legW + 0.03, shoe, p.legW + 0.08, a.shoes);
  return b.build();
}

/**
 * A voxel character: separate meshes for torso, head, arms and legs so limbs can swing.
 * The root sits at the feet and faces local +Z.
 */
export class VoxelCharacter {
  readonly root = new THREE.Group();
  private upper = new THREE.Group();
  private headPivot = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private material: THREE.Material;
  private phase = Math.random() * 10;
  private t = Math.random() * 10;
  private hipY = 0.55;
  /** Height of the top of the head, for placing labels. */
  headTop = 1.8;

  constructor(appearance: Appearance, opts: { ghost?: boolean } = {}) {
    if (opts.ghost) {
      this.material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false });
    } else {
      this.material = materials.voxel;
    }
    this.root.add(this.upper, this.legL, this.legR);
    this.upper.add(this.headPivot, this.armL, this.armR);
    this.setAppearance(appearance);
  }

  setAppearance(a: Appearance) {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    this.meshes = [];
    const p = BODY[a.body];
    const mk = (g: THREE.BufferGeometry, parent: THREE.Object3D) => {
      const m = new THREE.Mesh(g, this.material);
      m.castShadow = this.material === materials.voxel;
      parent.add(m);
      this.meshes.push(m);
      return m;
    };

    this.legL.position.set(-p.legW / 2 - 0.02, p.legH, 0);
    this.legR.position.set(p.legW / 2 + 0.02, p.legH, 0);
    mk(buildLeg(a, p), this.legL);
    mk(buildLeg(a, p), this.legR);

    this.hipY = p.legH;
    this.upper.position.set(0, p.legH, 0);
    mk(buildTorso(a, p), this.upper);
    this.armL.position.set(-(p.torsoW / 2 + p.armW / 2 + 0.01), p.torsoH - 0.06, 0);
    this.armR.position.set(p.torsoW / 2 + p.armW / 2 + 0.01, p.torsoH - 0.06, 0);
    mk(buildArm(a, p), this.armL);
    mk(buildArm(a, p), this.armR);
    this.headPivot.position.set(0, p.torsoH, 0);
    mk(buildHead(a, p), this.headPivot);

    this.headTop = p.legH + p.torsoH + p.head + 0.35;
  }

  /** Advance procedural animation. `speed` is horizontal speed in m/s. */
  animate(state: AnimState, dt: number, speed = 0) {
    this.t += dt;
    const lerp = (obj: THREE.Object3D, target: number, k = 12) => {
      obj.rotation.x += (target - obj.rotation.x) * Math.min(1, dt * k);
    };
    let legA = 0, armA = 0, bob = 0, armSpread = 0;
    if (state === 'walk' || state === 'run') {
      const run = state === 'run';
      this.phase += dt * (run ? 12 : 8) * Math.max(0.6, Math.min(1.3, speed / (run ? 7.5 : 4.2)));
      const s = Math.sin(this.phase);
      legA = s * (run ? 0.95 : 0.6);
      armA = -s * (run ? 1.0 : 0.55);
      bob = Math.abs(Math.cos(this.phase)) * (run ? 0.08 : 0.045);
    } else if (state === 'jump' || state === 'fall') {
      legA = state === 'jump' ? 0.5 : 0.2;
      armA = -2.6;
      armSpread = 0.35;
    } else if (state === 'sit') {
      legA = -1.4;
      armA = -0.3;
    } else {
      bob = Math.sin(this.t * 2.2) * 0.015;
      armA = Math.sin(this.t * 1.6) * 0.05;
    }
    lerp(this.legL, legA);
    lerp(this.legR, state === 'jump' || state === 'fall' ? -legA : state === 'sit' ? legA : -legA);
    lerp(this.armL, armA);
    lerp(this.armR, state === 'jump' || state === 'fall' || state === 'sit' ? armA : -armA);
    this.armL.rotation.z += (-armSpread - this.armL.rotation.z) * Math.min(1, dt * 10);
    this.armR.rotation.z += (armSpread - this.armR.rotation.z) * Math.min(1, dt * 10);
    this.upper.position.y += (this.hipY + bob - this.upper.position.y) * Math.min(1, dt * 15);
    // Idle head look-around
    this.headPivot.rotation.y = state === 'idle' ? Math.sin(this.t * 0.4) * 0.25 : this.headPivot.rotation.y * 0.9;
  }

  setOpacity(o: number) {
    if (this.material !== materials.voxel) (this.material as THREE.MeshLambertMaterial).opacity = o;
  }

  dispose() {
    for (const m of this.meshes) m.geometry.dispose();
    if (this.material !== materials.voxel) this.material.dispose();
    this.root.removeFromParent();
  }
}

