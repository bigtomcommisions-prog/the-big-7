import * as THREE from 'three';
import type { Prop, PropType } from '@hearthvale/shared';
import type { Collider, CollisionWorld } from '../collision.ts';
import { VoxelBuilder, materials } from '../voxel.ts';

/**
 * Each prop type = a "base" geometry (fixed colours) + optional "tint" geometry (white, coloured
 * per instance). Both are drawn with InstancedMesh, so thousands of trees/flowers cost a few calls.
 */
interface PropDef {
  base: () => VoxelBuilder;
  tint?: () => VoxelBuilder;
  palette?: string[];
  collider?: (p: Prop) => Omit<Collider, 'x' | 'z'> | null;
  castShadow?: boolean;
  /** Local positions of light glows. */
  glows?: THREE.Vector3[];
}

const WHITE = '#ffffff';

const DEFS: Record<PropType, PropDef> = {
  tree: {
    base: () => new VoxelBuilder(0.05, 3).box(0, 1.1, 0, 0.55, 2.2, 0.55, '#7b5234'),
    tint: () => new VoxelBuilder(0.07, 4)
      .box(0, 2.9, 0, 2.6, 1.6, 2.6, WHITE).box(0, 3.9, 0, 1.8, 1.0, 1.8, WHITE)
      .box(0.9, 2.4, 0.5, 1.2, 1.0, 1.2, WHITE).box(-0.8, 2.5, -0.6, 1.1, 0.9, 1.1, WHITE),
    palette: ['#6cbf5b', '#5fae55', '#7ccc63', '#4f9e4c', '#8fce5e', '#e3a53c', '#d9713c', '#e8c45a'],
    collider: (p) => ({ kind: 'circle', r: 0.4 * p.s, y0: 0, y1: 4, camera: false }),
    castShadow: true,
  },
  pine: {
    base: () => new VoxelBuilder(0.05, 5).box(0, 0.8, 0, 0.5, 1.6, 0.5, '#6b4630'),
    tint: () => {
      const b = new VoxelBuilder(0.06, 6);
      for (let i = 0; i < 4; i++) b.box(0, 1.6 + i * 0.9, 0, 2.6 - i * 0.6, 0.9, 2.6 - i * 0.6, WHITE);
      return b.box(0, 5.2, 0, 0.4, 0.5, 0.4, WHITE);
    },
    palette: ['#3f8a55', '#387c4d', '#468f5a', '#2f7045'],
    collider: (p) => ({ kind: 'circle', r: 0.4 * p.s, y0: 0, y1: 5, camera: false }),
    castShadow: true,
  },
  birch: {
    base: () => new VoxelBuilder(0.05, 7).box(0, 1.3, 0, 0.4, 2.6, 0.4, '#efece4').box(0.001, 0.8, 0.21, 0.4, 0.1, 0.02, '#3b3b3b').box(0.001, 1.7, -0.21, 0.4, 0.1, 0.02, '#3b3b3b'),
    tint: () => new VoxelBuilder(0.07, 8).box(0, 3.1, 0, 1.9, 1.5, 1.9, WHITE).box(0, 4.0, 0, 1.2, 0.8, 1.2, WHITE),
    palette: ['#a8d85e', '#b5de6a', '#f2c94c', '#9fd35b'],
    collider: (p) => ({ kind: 'circle', r: 0.3 * p.s, y0: 0, y1: 4, camera: false }),
    castShadow: true,
  },
  bush: {
    base: () => new VoxelBuilder(0, 1),
    tint: () => new VoxelBuilder(0.08, 9).box(0, 0.45, 0, 1.2, 0.9, 1.1, WHITE).box(0.3, 0.75, 0.1, 0.7, 0.5, 0.7, WHITE),
    palette: ['#5fae55', '#6cbf5b', '#4f9e4c', '#7ccc63'],
    collider: () => ({ kind: 'circle', r: 0.5, y0: 0, y1: 0.9 }),
    castShadow: true,
  },
  flower: {
    base: () => new VoxelBuilder(0, 1).box(0, 0.18, 0, 0.06, 0.36, 0.06, '#4f9e4c').box(0.08, 0.1, 0, 0.14, 0.05, 0.06, '#5fae55'),
    tint: () => new VoxelBuilder(0, 2).box(0, 0.4, 0, 0.18, 0.12, 0.18, WHITE),
    palette: ['#ff8fb1', '#ffe066', '#c8a2ff', '#ffffff', '#ff6f59', '#7ec8ff', '#ffb347'],
  },
  mushroom: {
    base: () => new VoxelBuilder(0, 1).box(0, 0.15, 0, 0.14, 0.3, 0.14, '#f4efe2'),
    tint: () => new VoxelBuilder(0, 2).box(0, 0.33, 0, 0.36, 0.14, 0.36, WHITE).box(0.08, 0.41, 0.05, 0.06, 0.03, 0.06, '#ffffff'),
    palette: ['#e25d5d', '#c07a4f', '#e8a44c'],
  },
  rock: {
    base: () => new VoxelBuilder(0.06, 13).box(0, 0.3, 0, 1.1, 0.6, 0.9, '#a39e96').box(0.25, 0.6, 0.1, 0.6, 0.35, 0.5, '#b4afa7'),
    collider: (p) => ({ kind: 'circle', r: 0.55 * p.s, y0: 0, y1: 0.65 * p.s }),
    castShadow: true,
  },
  stump: {
    base: () => new VoxelBuilder(0.05, 14).box(0, 0.2, 0, 0.7, 0.4, 0.7, '#7b5234').box(0, 0.41, 0, 0.55, 0.02, 0.55, '#c9a26b'),
    collider: () => ({ kind: 'circle', r: 0.38, y0: 0, y1: 0.42 }),
  },
  lamp: {
    base: () => new VoxelBuilder(0, 15)
      .box(0, 0.12, 0, 0.5, 0.24, 0.5, '#4a4540').box(0, 1.6, 0, 0.14, 3.0, 0.14, '#3f3b37')
      .box(0, 3.15, 0, 0.55, 0.1, 0.55, '#3f3b37').box(0, 3.6, 0, 0.6, 0.12, 0.6, '#3f3b37'),
    tint: () => new VoxelBuilder(0, 16).box(0, 3.38, 0, 0.42, 0.38, 0.42, WHITE),
    palette: ['#ffe2a3'],
    collider: () => ({ kind: 'circle', r: 0.2, y0: 0, y1: 3.7, camera: false }),
    castShadow: true,
    glows: [new THREE.Vector3(0, 3.38, 0)],
  },
  bench: {
    base: () => new VoxelBuilder(0.03, 17)
      .box(0, 0.48, 0, 1.8, 0.1, 0.55, '#a8744a').box(0, 0.85, -0.25, 1.8, 0.45, 0.08, '#a8744a')
      .box(-0.75, 0.24, 0, 0.12, 0.48, 0.5, '#3f3b37').box(0.75, 0.24, 0, 0.12, 0.48, 0.5, '#3f3b37'),
    collider: (p) => ({ kind: 'box', hw: 0.9, hd: 0.3, ry: p.ry, y0: 0, y1: 0.53 }),
    castShadow: true,
  },
  fence: {
    base: () => new VoxelBuilder(0.04, 18)
      .box(-0.5, 0.45, 0, 0.14, 0.9, 0.14, '#c99d6b').box(0, 0.62, 0, 1.0, 0.1, 0.07, '#d8ae7c').box(0, 0.32, 0, 1.0, 0.1, 0.07, '#d8ae7c'),
    collider: (p) => ({ kind: 'box', hw: 0.55, hd: 0.1, ry: p.ry, y0: 0, y1: 0.9, noStand: true }),
  },
  crate: {
    base: () => new VoxelBuilder(0.05, 19).box(0, 0.4, 0, 0.8, 0.8, 0.8, '#b98a57').box(0, 0.4, 0.41, 0.8, 0.12, 0.02, '#8a6238').box(0, 0.4, -0.41, 0.8, 0.12, 0.02, '#8a6238'),
    collider: (p) => ({ kind: 'box', hw: 0.42, hd: 0.42, ry: p.ry, y0: 0, y1: 0.8 }),
    castShadow: true,
  },
  barrel: {
    base: () => new VoxelBuilder(0.04, 20).box(0, 0.45, 0, 0.7, 0.9, 0.7, '#9c6b43').box(0, 0.25, 0, 0.74, 0.08, 0.74, '#5a5550').box(0, 0.7, 0, 0.74, 0.08, 0.74, '#5a5550'),
    collider: () => ({ kind: 'circle', r: 0.38, y0: 0, y1: 0.9 }),
    castShadow: true,
  },
  haybale: {
    base: () => new VoxelBuilder(0.05, 21).box(0, 0.45, 0, 1.2, 0.9, 0.9, '#e2c36b').box(0, 0.45, 0, 1.22, 0.1, 0.92, '#b6933f'),
    collider: (p) => ({ kind: 'box', hw: 0.62, hd: 0.47, ry: p.ry, y0: 0, y1: 0.9 }),
    castShadow: true,
  },
  mailbox: {
    base: () => new VoxelBuilder(0.03, 22).box(0, 0.55, 0, 0.1, 1.1, 0.1, '#7b5234'),
    tint: () => new VoxelBuilder(0.03, 23).box(0, 1.2, 0, 0.35, 0.3, 0.5, WHITE).box(0.2, 1.35, 0.1, 0.03, 0.25, 0.06, '#e25d5d'),
    palette: ['#4f86c6', '#e25d5d', '#5fa464', '#e3a53c'],
    collider: () => ({ kind: 'circle', r: 0.15, y0: 0, y1: 1.3 }),
  },
  signpost: {
    // Text boards are added separately (they need per-sign textures).
    base: () => new VoxelBuilder(0.03, 24).box(0, 1.1, 0, 0.18, 2.2, 0.18, '#7b5234'),
    collider: () => ({ kind: 'circle', r: 0.15, y0: 0, y1: 2.2 }),
    castShadow: true,
  },
};

const dummy = new THREE.Object3D();
const color = new THREE.Color();

export interface BuiltProps {
  meshes: THREE.Object3D[];
  glows: THREE.Vector3[];
}

export function buildProps(props: Prop[], collision: CollisionWorld): BuiltProps {
  const byType = new Map<PropType, Prop[]>();
  for (const p of props) {
    let list = byType.get(p.t);
    if (!list) byType.set(p.t, (list = []));
    list.push(p);
  }
  const meshes: THREE.Object3D[] = [];
  const glows: THREE.Vector3[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (const [type, list] of byType) {
    const def = DEFS[type];
    const parts: { geo: THREE.BufferGeometry; tinted: boolean; mat: THREE.Material }[] = [];
    const baseB = def.base();
    if (!baseB.empty) parts.push({ geo: baseB.build(), tinted: false, mat: materials.voxel });
    if (def.tint) {
      const tintMat = type === 'lamp' ? new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true }) : materials.voxel;
      parts.push({ geo: def.tint().build(), tinted: true, mat: tintMat });
    }
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      mesh.castShadow = Boolean(def.castShadow);
      mesh.receiveShadow = true;
      list.forEach((p, i) => {
        dummy.position.set(p.x, 0, p.z);
        dummy.rotation.set(0, p.ry, 0);
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (part.tinted && def.palette) mesh.setColorAt(i, color.set(def.palette[p.v % def.palette.length]!));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      meshes.push(mesh);
    }
    for (const p of list) {
      const c = def.collider?.(p);
      if (c) collision.add({ ...c, x: p.x, z: p.z } as Collider);
      for (const g of def.glows ?? []) glows.push(g.clone().multiplyScalar(p.s).applyAxisAngle(up, p.ry).add(new THREE.Vector3(p.x, 0, p.z)));
    }
  }
  return { meshes, glows };
}
