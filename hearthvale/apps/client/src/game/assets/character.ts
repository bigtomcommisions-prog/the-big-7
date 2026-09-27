import * as THREE from 'three';
import type { AnimState, Appearance } from '@hearthvale/shared';
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

function buildHead(a: Appearance, p: Proportions): THREE.BufferGeometry {
  const s = p.head;
  const b = new VoxelBuilder(0.02, 7);
  const hair = a.hairColor;
  const acc = a.accessoryColor;
  // Head + face
  b.box(0, s / 2, 0, s, s, s, a.skin);
  b.box(-s * 0.2, s * 0.48, s / 2 + 0.005, 0.08, 0.12, 0.02, '#2b2220');
  b.box(s * 0.2, s * 0.48, s / 2 + 0.005, 0.08, 0.12, 0.02, '#2b2220');
  b.box(-s * 0.2, s * 0.52, s / 2 + 0.012, 0.03, 0.04, 0.01, '#ffffff');
  b.box(s * 0.2, s * 0.52, s / 2 + 0.012, 0.03, 0.04, 0.01, '#ffffff');
  b.box(-s * 0.33, s * 0.32, s / 2 + 0.005, 0.1, 0.05, 0.02, '#f29c9c');
  b.box(s * 0.33, s * 0.32, s / 2 + 0.005, 0.1, 0.05, 0.02, '#f29c9c');
  b.box(0, s * 0.28, s / 2 + 0.005, 0.1, 0.03, 0.02, shadeHex(a.skin, 0.65));

  const cap = () => {
    b.box(0, s + 0.06, 0, s + 0.08, 0.14, s + 0.08, hair);
    b.box(0, s * 0.62, -s / 2 - 0.035, s + 0.08, s * 0.7, 0.08, hair);
  };
  switch (a.hair) {
    case 'short':
      cap();
      b.box(0, s - 0.05, s / 2 + 0.03, s + 0.06, 0.12, 0.06, hair);
      b.box(-s / 2 - 0.03, s * 0.75, 0, 0.07, s * 0.4, s * 0.9, hair);
      b.box(s / 2 + 0.03, s * 0.75, 0, 0.07, s * 0.4, s * 0.9, hair);
      break;
    case 'long':
      cap();
      b.box(0, s * 0.3, -s / 2 - 0.05, s + 0.12, s + 0.15, 0.12, hair);
      b.box(-s / 2 - 0.04, s * 0.45, -0.02, 0.09, s * 0.95, s * 0.95, hair);
      b.box(s / 2 + 0.04, s * 0.45, -0.02, 0.09, s * 0.95, s * 0.95, hair);
      b.box(-s * 0.18, s - 0.06, s / 2 + 0.03, s * 0.55, 0.12, 0.06, hair);
      break;
    case 'spiky':
      cap();
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * s * 0.2;
        b.box(x, s + 0.2, (i % 2) * 0.08 - 0.04, 0.14, 0.26, 0.14, hair, { z: (i - 2) * 0.25 });
      }
      b.box(0, s - 0.04, s / 2 + 0.03, s + 0.04, 0.1, 0.06, hair);
      break;
    case 'bun':
      cap();
      b.box(0, s - 0.05, s / 2 + 0.03, s + 0.06, 0.1, 0.06, hair);
      b.box(0, s + 0.24, -0.12, 0.26, 0.24, 0.26, shadeHex(hair, 0.95));
      break;
    case 'bob':
      cap();
      b.box(-s / 2 - 0.04, s * 0.5, 0, 0.09, s * 0.75, s + 0.06, hair);
      b.box(s / 2 + 0.04, s * 0.5, 0, 0.09, s * 0.75, s + 0.06, hair);
      b.box(0, s - 0.08, s / 2 + 0.03, s + 0.1, 0.16, 0.06, hair);
      break;
    case 'none':
      break;
  }

  switch (a.accessory) {
    case 'beanie':
      b.box(0, s + 0.1, 0, s + 0.12, 0.26, s + 0.12, acc);
      b.box(0, s - 0.02, 0, s + 0.14, 0.08, s + 0.14, shadeHex(acc, 0.8));
      b.box(0, s + 0.3, 0, 0.14, 0.14, 0.14, '#ffffff');
      break;
    case 'crown': {
      const y = s + (a.hair === 'none' ? 0.02 : 0.14);
      b.box(0, y + 0.06, 0, s * 0.8, 0.12, s * 0.8, acc);
      for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1], [0, 1]] as const) {
        b.box((x * s * 0.8) / 2.3, y + 0.18, (z * s * 0.8) / 2.3, 0.08, 0.14, 0.08, acc);
      }
      b.box(0, y + 0.08, s * 0.4 + 0.01, 0.07, 0.07, 0.02, '#e25d5d');
      break;
    }
    case 'flower': {
      const cx = s / 2 + 0.02, cy = s * 0.88, cz = s * 0.15;
      b.box(cx, cy, cz, 0.08, 0.08, 0.08, '#ffe066');
      for (const [dy, dz] of [[0.09, 0], [-0.09, 0], [0, 0.09], [0, -0.09]] as const) b.box(cx, cy + dy, cz + dz, 0.07, 0.09, 0.09, acc);
      break;
    }
    case 'headphones':
      b.box(0, s + 0.14, 0, s + 0.2, 0.07, 0.1, '#3a3a44');
      b.box(-s / 2 - 0.08, s * 0.5, 0, 0.12, 0.24, 0.24, acc);
      b.box(s / 2 + 0.08, s * 0.5, 0, 0.12, 0.24, 0.24, acc);
      b.box(-s / 2 - 0.08, s * 0.85, 0, 0.06, s * 0.5, 0.06, '#3a3a44');
      b.box(s / 2 + 0.08, s * 0.85, 0, 0.06, s * 0.5, 0.06, '#3a3a44');
      break;
    case 'glasses': {
      const z = s / 2 + 0.03;
      for (const x of [-s * 0.2, s * 0.2]) {
        b.box(x, s * 0.58, z, 0.2, 0.03, 0.02, acc);
        b.box(x, s * 0.38, z, 0.2, 0.03, 0.02, acc);
        b.box(x - 0.1, s * 0.48, z, 0.03, 0.2, 0.02, acc);
        b.box(x + 0.1, s * 0.48, z, 0.03, 0.2, 0.02, acc);
      }
      b.box(0, s * 0.52, z, 0.1, 0.03, 0.02, acc);
      break;
    }
    case 'strawhat':
      b.box(0, s + 0.04, 0, s * 1.7, 0.06, s * 1.7, '#e8cf8a');
      b.box(0, s + 0.18, 0, s + 0.04, 0.24, s + 0.04, '#e8cf8a');
      b.box(0, s + 0.1, 0, s + 0.06, 0.07, s + 0.06, acc);
      break;
    case 'scarf':
    case 'none':
      break;
  }
  return b.build();
}

function buildTorso(a: Appearance, p: Proportions): THREE.BufferGeometry {
  const b = new VoxelBuilder(0.02, 3);
  b.box(0, p.torsoH / 2, 0, p.torsoW, p.torsoH, p.torsoD, a.shirt);
  b.box(0, 0.05, 0, p.torsoW + 0.02, 0.1, p.torsoD + 0.02, shadeHex(a.pants, 0.9)); // belt line
  b.box(0, p.torsoH * 0.62, p.torsoD / 2 + 0.01, 0.12, 0.12, 0.02, shadeHex(a.shirt, 0.8)); // pocket/badge
  if (a.accessory === 'scarf') {
    b.box(0, p.torsoH - 0.05, 0, p.torsoW + 0.06, 0.14, p.torsoD + 0.08, a.accessoryColor);
    b.box(p.torsoW * 0.22, p.torsoH - 0.24, p.torsoD / 2 + 0.05, 0.14, 0.3, 0.06, a.accessoryColor);
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

