import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createRng, type HouseLayout, type PlazaLayout, type TownLayout, type WorldLayout } from '@hearthvale/shared';
import { CollisionWorld } from './collision.ts';
import { VoxelBuilder, materials } from './voxel.ts';
import { buildGazebo, buildHouse, type BuiltHouse } from './assets/buildings.ts';
import { buildProps } from './assets/props.ts';
import { signBoard } from './assets/text.ts';
import { h } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';

export interface HouseEntry {
  layout: HouseLayout;
  built: BuiltHouse;
  label: CSS2DObject;
  labelEl: HTMLElement;
  pingUntil: number;
}

export interface PlazaEntry {
  layout: PlazaLayout;
  seats: THREE.Vector3[];
  label: CSS2DObject;
  labelEl: HTMLElement;
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,236,190,1)');
  g.addColorStop(0.3, 'rgba(255,214,140,0.55)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW_TEX = glowTexture();

/** Builds and owns every static object in the world for one layout. */
export class WorldView {
  readonly group = new THREE.Group();
  readonly collision = new CollisionWorld();
  readonly houses = new Map<string, HouseEntry>();
  readonly plazas = new Map<string, PlazaEntry>();
  private water: THREE.Mesh[] = [];
  private flames: THREE.Mesh[] = [];
  private glowMat: THREE.PointsMaterial | null = null;
  private hiddenRoof: THREE.Object3D | null = null;
  private disposables: { dispose(): void }[] = [];

  constructor(readonly layout: WorldLayout, guildName: string) {
    this.collision.radius = layout.radius - 3;
    this.buildGround();
    this.buildPaths();
    this.buildCreeks();
    this.buildHub(guildName);
    for (const t of layout.towns) this.buildTownCentre(t);
    for (const hl of layout.houses) this.addHouse(hl);
    for (const p of layout.plazas) this.addPlaza(p);
    const props = buildProps(layout.props, this.collision);
    for (const m of props.meshes) this.group.add(m);
    this.buildSigns();
    this.buildGlows([
      ...props.glows,
      ...[...this.houses.values()].flatMap((e) => e.built.lights),
      ...[...this.plazas.values()].map((p) => new THREE.Vector3(p.layout.x, 5.5, p.layout.z)),
    ]);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) this.disposables.push(o.geometry);
    });
  }

  private buildGround() {
    const size = this.layout.radius * 2 + 160;
    const seg = Math.min(220, Math.round(size / 4));
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position!;
    const colors = new Float32Array(pos.count * 3);
    const rng = createRng(this.layout.seed ^ 0x9e37);
    const a = new THREE.Color('#8fcf6a');
    const b = new THREE.Color('#7cbf5c');
    const c = new THREE.Color('#a3d877');
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = (Math.sin(x * 0.05) + Math.cos(z * 0.043) + Math.sin((x + z) * 0.021)) / 3;
      tmp.copy(a).lerp(n > 0 ? c : b, Math.abs(n)).multiplyScalar(0.96 + rng() * 0.08);
      const d = Math.hypot(x, z);
      if (d > this.layout.radius) tmp.lerp(new THREE.Color('#5f9f4c'), Math.min(1, (d - this.layout.radius) / 40));
      colors.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.group.add(ground);
  }

  private buildPaths() {
    const b = new VoxelBuilder(0, 1);
    const tiles = new VoxelBuilder(0.06, 77);
    const colors = { road: '#e3c898', lane: '#dcc193' } as const;
    for (const p of this.layout.paths) {
      if (p.kind === 'plaza') {
        const r = p.width / 2;
        const grout = new THREE.Mesh(new THREE.CircleGeometry(r + 0.4, 40), new THREE.MeshLambertMaterial({ color: '#b3a58d' }));
        grout.rotation.x = -Math.PI / 2;
        grout.position.set(p.ax, 0.012, p.az);
        grout.receiveShadow = true;
        this.group.add(grout);
        for (let x = -r; x <= r; x += 1.2) {
          for (let z = -r; z <= r; z += 1.2) {
            if (Math.hypot(x, z) > r) continue;
            const alt = (Math.round(x / 1.2) + Math.round(z / 1.2)) % 2 === 0;
            tiles.box(p.ax + x, 0.04, p.az + z, 1.14, 0.08, 1.14, alt ? '#d6cab6' : '#cbbda6');
          }
        }
        continue;
      }
      const dx = p.bx - p.ax, dz = p.bz - p.az;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const y = p.kind === 'road' ? 0.025 : 0.02;
      b.box((p.ax + p.bx) / 2, y, (p.az + p.bz) / 2, p.width, 0.03, len + p.width * 0.6, colors[p.kind], { y: Math.atan2(dx, dz) });
    }
    for (const builder of [b, tiles]) {
      if (builder.empty) continue;
      const m = new THREE.Mesh(builder.build(), materials.voxel);
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  private buildCreeks() {
    for (const c of this.layout.creeks) {
      const g = new THREE.Group();
      g.position.set(c.x, 0, c.z);
      g.rotation.y = c.ry;
      const water = new THREE.Mesh(new THREE.BoxGeometry(c.length, 0.1, c.width), materials.water);
      water.position.y = 0.035;
      g.add(water);
      this.water.push(water);
      const banks = new VoxelBuilder(0.08, 31);
      for (let x = -c.length / 2; x < c.length / 2; x += 0.9) {
        for (const side of [-1, 1]) banks.box(x + 0.45, 0.08, side * (c.width / 2 + 0.3), 0.8, 0.18, 0.55, '#a39e96');
      }
      // Bridge (crosses along local Z)
      const bw = c.bridgeWidth;
      const deckLen = c.width + 2.2;
      for (let z = -deckLen / 2; z < deckLen / 2; z += 0.5) {
        const arch = 0.18 + Math.cos((z / deckLen) * Math.PI) * 0.18;
        banks.box(0, arch, z + 0.25, bw, 0.14, 0.46, '#b07d52');
      }
      for (const side of [-1, 1]) {
        for (let z = -deckLen / 2; z <= deckLen / 2; z += deckLen / 3) banks.box(side * (bw / 2 - 0.1), 0.65, z, 0.18, 0.9, 0.18, '#7b5234');
        banks.box(side * (bw / 2 - 0.1), 1.05, 0, 0.14, 0.12, deckLen, '#8a5a3c');
      }
      const bm = new THREE.Mesh(banks.build(), materials.voxel);
      bm.castShadow = bm.receiveShadow = true;
      g.add(bm);
      this.group.add(g);

      const segHw = (c.length - bw) / 4;
      const segCx = (c.length + bw) / 4;
      for (const side of [-1, 1]) {
        this.collision.addLocalBox(c.x, c.z, c.ry, side * segCx, 0, segHw, c.width / 2, 0, 0.4, { noStand: true });
        this.collision.addLocalBox(c.x, c.z, c.ry, side * (bw / 2 - 0.1), 0, 0.12, deckLen / 2, 0, 1.1, { noStand: true });
      }
      this.collision.addLocalBox(c.x, c.z, c.ry, 0, 0, bw / 2 - 0.2, deckLen / 2 - 0.4, 0, 0.3);
    }
  }

  private fountain(x: number, z: number, r: number, b: VoxelBuilder) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.box(x + Math.cos(a) * r, 0.4, z + Math.sin(a) * r, 1.3 * (r / 2.2), 0.8, 0.7, '#c9c1b4', { y: -a + Math.PI / 2 });
    }
    b.box(x, 0.6, z, 0.8, 1.2, 0.8, '#bdb5a8').box(x, 1.3, z, 1.6, 0.2, 1.6, '#c9c1b4').box(x, 1.8, z, 0.4, 0.8, 0.4, '#bdb5a8');
    const water = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.2, r - 0.2, 0.1, 16), materials.water);
    water.position.set(x, 0.62, z);
    this.group.add(water);
    this.water.push(water);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.9, 8), new THREE.MeshLambertMaterial({ color: '#bfe6f5', transparent: true, opacity: 0.7 }));
    spout.position.set(x, 2.5, z);
    this.group.add(spout);
    this.collision.add({ kind: 'circle', x, z, r: r + 0.4, y0: 0, y1: 0.8, noStand: true });
  }

  private buildHub(guildName: string) {
    const b = new VoxelBuilder(0.04, 41);
    this.fountain(0, 0, 3.2, b);
    const m = new THREE.Mesh(b.build(), materials.voxel);
    m.castShadow = m.receiveShadow = true;
    this.group.add(m);
    const welcome = signBoard(`Welcome to ${guildName}`, 6, 1.1, { bg: '#6b4a32', border: '#4a3222' });
    welcome.position.set(0, 3.6, -7);
    const posts = new VoxelBuilder(0.03, 42).box(-2.8, 1.8, -7.05, 0.25, 3.6, 0.25, '#7b5234').box(2.8, 1.8, -7.05, 0.25, 3.6, 0.25, '#7b5234');
    this.group.add(welcome, new THREE.Mesh(posts.build(), materials.voxel));
    this.collision.add({ kind: 'circle', x: -2.8, z: -7.05, r: 0.2, y0: 0, y1: 3.6 });
    this.collision.add({ kind: 'circle', x: 2.8, z: -7.05, r: 0.2, y0: 0, y1: 3.6 });
  }

  private buildTownCentre(t: TownLayout) {
    const b = new VoxelBuilder(0.05, 50 + t.palette);
    switch (t.centerpiece) {
      case 'fountain':
        this.fountain(t.x, t.z, 2.2, b);
        break;
      case 'well':
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          b.box(t.x + Math.cos(a) * 1.1, 0.5, t.z + Math.sin(a) * 1.1, 0.75, 1.0, 0.45, '#b4aca0', { y: -a + Math.PI / 2 });
        }
        b.box(t.x - 1.1, 1.6, t.z, 0.2, 2.2, 0.2, '#7b5234').box(t.x + 1.1, 1.6, t.z, 0.2, 2.2, 0.2, '#7b5234');
        b.box(t.x, 2.6, t.z, 3.0, 0.3, 1.8, '#c8553d').box(t.x, 2.85, t.z, 2.2, 0.25, 1.1, '#b04a35');
        b.box(t.x, 2.0, t.z, 0.25, 0.4, 0.3, '#8a5a3c');
        this.collision.add({ kind: 'circle', x: t.x, z: t.z, r: 1.4, y0: 0, y1: 1.0, noStand: true });
        break;
      case 'tree':
        b.box(t.x, 1.8, t.z, 1.0, 3.6, 1.0, '#7b5234');
        b.box(t.x, 4.8, t.z, 5, 2.6, 5, '#e89fbf').box(t.x, 6.3, t.z, 3.4, 1.4, 3.4, '#f2b6cf').box(t.x + 1.6, 4.2, t.z + 1, 2, 1.4, 2, '#f2b6cf');
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          b.box(t.x + Math.cos(a) * 1.6, 0.2, t.z + Math.sin(a) * 1.6, 0.9, 0.4, 0.5, '#a39e96', { y: -a });
        }
        this.collision.add({ kind: 'circle', x: t.x, z: t.z, r: 0.8, y0: 0, y1: 4 });
        break;
      case 'bonfire': {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          b.box(t.x + Math.cos(a) * 1.0, 0.18, t.z + Math.sin(a) * 1.0, 0.5, 0.36, 0.4, '#8e8a84', { y: -a });
        }
        b.box(t.x, 0.25, t.z, 1.4, 0.25, 0.3, '#6b4630', { y: 0.6 }).box(t.x, 0.3, t.z, 1.4, 0.25, 0.3, '#7b5234', { y: -0.6 });
        const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347' });
        for (let i = 0; i < 3; i++) {
          const f = new THREE.Mesh(new THREE.BoxGeometry(0.5 - i * 0.12, 0.6 - i * 0.1, 0.5 - i * 0.12), flameMat);
          f.position.set(t.x + (i - 1) * 0.15, 0.6 + i * 0.25, t.z);
          this.group.add(f);
          this.flames.push(f);
        }
        this.collision.add({ kind: 'circle', x: t.x, z: t.z, r: 1.2, y0: 0, y1: 0.5, noStand: true });
        // logs to sit on
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + t.gateAngle;
          const lx = t.x + Math.cos(a) * 3, lz = t.z + Math.sin(a) * 3;
          b.box(lx, 0.25, lz, 1.8, 0.5, 0.5, '#7b5234', { y: -a + Math.PI / 2 });
          this.collision.add({ kind: 'box', x: lx, z: lz, hw: 0.9, hd: 0.25, ry: -a + Math.PI / 2, y0: 0, y1: 0.5 });
        }
        break;
      }
    }
    const m = new THREE.Mesh(b.build(), materials.voxel);
    m.castShadow = m.receiveShadow = true;
    this.group.add(m);
  }

  private addHouse(hl: HouseLayout) {
    const built = buildHouse(hl, this.collision);
    this.group.add(built.group);
    const labelEl = h('div', { class: `house-label ${hl.active ? '' : 'closed'}` }, hl.active ? `# ${hl.name}` : 'closed', h('span', { class: 'ping' }, icon('message', '13px')));
    const label = new CSS2DObject(labelEl);
    label.position.copy(built.labelPos);
    this.group.add(label);
    this.houses.set(hl.channelId, { layout: hl, built, label, labelEl, pingUntil: 0 });
  }

  private addPlaza(p: PlazaLayout) {
    const g = buildGazebo(p, this.collision);
    this.group.add(g.group);
    const labelEl = h('div', { class: 'house-label voice' }, icon('voice', '13px'), p.name);
    const label = new CSS2DObject(labelEl);
    label.position.copy(g.labelPos);
    this.group.add(label);
    this.plazas.set(p.channelId, { layout: p, seats: g.seats, label, labelEl });
  }

  private buildSigns() {
    for (const p of this.layout.props) {
      if (p.t !== 'signpost' || !p.label) continue;
      const board = signBoard(p.label, 2.6 * p.s, 0.6 * p.s, { bg: '#8a5a3c', border: '#5c3b27' });
      board.position.set(p.x, 1.9 * p.s, p.z);
      board.rotation.y = p.ry;
      board.translateZ(0.12);
      this.group.add(board);
    }
  }

  private buildGlows(points: THREE.Vector3[]) {
    if (!points.length) return;
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    this.glowMat = new THREE.PointsMaterial({
      map: GLOW_TEX, size: 3.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.8,
    });
    this.group.add(new THREE.Points(geo, this.glowMat));
  }

  /** Per-frame: animate water/flames, hide the roof of the house you're in, fade distant labels. */
  update(time: number, camera: THREE.Camera, playerPos: THREE.Vector3, insideHouse: string | null) {
    for (const w of this.water) (w.material as THREE.MeshLambertMaterial).opacity = 0.78 + Math.sin(time * 1.5) * 0.04;
    this.flames.forEach((f, i) => {
      f.scale.y = 0.8 + Math.sin(time * 9 + i * 2) * 0.25;
      f.rotation.y = time * (1 + i);
    });
    if (this.glowMat) this.glowMat.opacity = 0.72 + Math.sin(time * 2.1) * 0.05;

    const roof = insideHouse ? this.houses.get(insideHouse)?.built.roof ?? null : null;
    if (roof !== this.hiddenRoof) {
      if (this.hiddenRoof) this.hiddenRoof.visible = true;
      if (roof) roof.visible = false;
      this.hiddenRoof = roof;
    }

    const now = performance.now();
    const cam = camera.position;
    for (const e of this.houses.values()) {
      const d = e.label.position.distanceTo(cam);
      const visible = d < 55 && e.layout.channelId !== insideHouse;
      e.label.visible = visible;
      if (visible) e.labelEl.style.opacity = String(Math.min(1, (55 - d) / 15));
      e.labelEl.classList.toggle('active-chat', e.pingUntil > now);
    }
    for (const p of this.plazas.values()) p.label.visible = p.label.position.distanceTo(playerPos) < 55;
  }

  /** Flash a speech icon over a channel's house when a message arrives. */
  ping(channelId: string) {
    const e = this.houses.get(channelId);
    if (e) e.pingUntil = performance.now() + 8000;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.group.traverse((o) => {
      if (o instanceof CSS2DObject) o.element.remove();
    });
    this.group.removeFromParent();
    this.collision.clear();
  }
}
