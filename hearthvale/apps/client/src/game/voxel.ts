import * as THREE from 'three';

/**
 * Builds merged, vertex-coloured box geometry. Everything voxel-y in the world goes through this,
 * so a whole house (or a whole prop type) is a single draw call.
 */
export class VoxelBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];
  private tmp = new THREE.Color();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private n = new THREE.Vector3();
  private nm = new THREE.Matrix3();

  /** Per-box brightness jitter (0 = flat) for a hand-made feel. */
  constructor(private jitter = 0.04, private seed = 1) {}

  private rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /**
   * Add an axis-aligned box centred at (x, y, z) with size (w, h, d), optionally rotated about Y
   * (and X/Z) around its own centre.
   */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, rot?: { x?: number; y?: number; z?: number }) {
    this.tmp.set(color);
    if (this.jitter) {
      const j = 1 + (this.rand() - 0.5) * 2 * this.jitter;
      this.tmp.multiplyScalar(j);
    }
    this.e.set(rot?.x ?? 0, rot?.y ?? 0, rot?.z ?? 0);
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(x, y, z), this.q, new THREE.Vector3(1, 1, 1));
    this.nm.getNormalMatrix(this.m);

    const hw = w / 2, hh = h / 2, hd = d / 2;
    // 6 faces: normal, 4 corners (ccw when seen from outside)
    const faces: [number[], number[][]][] = [
      [[1, 0, 0], [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]]],
      [[-1, 0, 0], [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]]],
      [[0, 1, 0], [[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]]],
      [[0, -1, 0], [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]]],
      [[0, 0, 1], [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]]],
      [[0, 0, -1], [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]]],
    ];
    for (const [normal, corners] of faces) {
      // Slight top-light / side-shade baked into vertex colour for extra depth.
      const shade = normal[1] === 1 ? 1.06 : normal[1] === -1 ? 0.7 : normal[0] !== 0 ? 0.9 : 0.96;
      const base = this.positions.length / 3;
      this.n.set(normal[0]!, normal[1]!, normal[2]!).applyMatrix3(this.nm).normalize();
      for (const c of corners) {
        this.v.set(c[0]!, c[1]!, c[2]!).applyMatrix4(this.m);
        this.positions.push(this.v.x, this.v.y, this.v.z);
        this.normals.push(this.n.x, this.n.y, this.n.z);
        this.colors.push(this.tmp.r * shade, this.tmp.g * shade, this.tmp.b * shade);
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }

  /** A stepped "voxel" pyramid / gable roof built from stacked slabs. */
  gableRoof(cx: number, y: number, cz: number, w: number, d: number, steps: number, stepH: number, color: THREE.ColorRepresentation, trim: THREE.ColorRepresentation) {
    for (let i = 0; i < steps; i++) {
      const sw = w - (i * w) / steps;
      this.box(cx, y + i * stepH + stepH / 2, cz, Math.max(sw, 0.5), stepH, d, i % 2 === 0 ? color : shadeHex(color, 0.92));
    }
    // ridge beam
    this.box(cx, y + steps * stepH + 0.1, cz, 0.5, 0.2, d + 0.2, trim);
    return this;
  }

  get empty() {
    return this.positions.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export function shadeHex(c: THREE.ColorRepresentation, f: number): THREE.Color {
  return new THREE.Color(c).multiplyScalar(f);
}

/** Shared materials: vertex-coloured, flat-shaded, lightly glossy. */
export const materials = {
  voxel: new THREE.MeshLambertMaterial({ vertexColors: true }),
  voxelTransparent: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1 }),
  glow: new THREE.MeshBasicMaterial({ color: '#ffd98a' }),
  water: new THREE.MeshLambertMaterial({ color: '#5fb6d9', transparent: true, opacity: 0.82 }),
};
