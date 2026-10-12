// A small N-body gravity simulation in 2D. Units are arbitrary: G = 1, distances are world units.
// Leapfrog (kick-drift-kick) integration keeps orbits stable for a long time; touching bodies merge.

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  m: number;
  r: number;
  color: string;
}

const SOFTENING2 = 4; // stops forces blowing up when bodies pass very close

/** Bodies lighter than this are dust: drawn small, and only ever swallowed by real bodies. */
export const DUST = 0.1;
export const radiusFor = (m: number) => (m < DUST ? 1 : Math.max(2, 1.5 * Math.cbrt(m)));

export function body(x: number, y: number, vx: number, vy: number, m: number, color: string): Body {
  return { x, y, vx, vy, m, r: radiusFor(m), color };
}

function accelerations(bs: Body[]) {
  const ax = new Float64Array(bs.length);
  const ay = new Float64Array(bs.length);
  for (let i = 0; i < bs.length; i++) {
    const a = bs[i]!;
    for (let j = i + 1; j < bs.length; j++) {
      const b = bs[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy + SOFTENING2;
      const inv = 1 / (d2 * Math.sqrt(d2));
      ax[i] = ax[i]! + dx * b.m * inv;
      ay[i] = ay[i]! + dy * b.m * inv;
      ax[j] = ax[j]! - dx * a.m * inv;
      ay[j] = ay[j]! - dy * a.m * inv;
    }
  }
  return [ax, ay] as const;
}

/** Advances the system by `dt`. Returns the bodies, with colliding pairs merged. */
export function step(bs: Body[], dt: number): Body[] {
  let [ax, ay] = accelerations(bs);
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i]!;
    b.vx += ax[i]! * dt * 0.5;
    b.vy += ay[i]! * dt * 0.5;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  [ax, ay] = accelerations(bs);
  for (let i = 0; i < bs.length; i++) {
    bs[i]!.vx += ax[i]! * dt * 0.5;
    bs[i]!.vy += ay[i]! * dt * 0.5;
  }
  return merge(bs);
}

/** Merges touching bodies, keeping total mass and momentum. The heavier one keeps its colour. */
export function merge(bs: Body[]): Body[] {
  const gone = new Set<number>();
  for (let i = 0; i < bs.length; i++) {
    if (gone.has(i)) continue;
    for (let j = i + 1; j < bs.length; j++) {
      if (gone.has(j)) continue;
      const a = bs[i]!;
      const b = bs[j]!;
      if (a.m < DUST && b.m < DUST) continue; // dust (star particles) never clumps together
      const rr = a.r + b.r;
      if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > rr * rr) continue;
      const m = a.m + b.m;
      const big = a.m >= b.m ? a : b;
      Object.assign(a, {
        x: (a.x * a.m + b.x * b.m) / m,
        y: (a.y * a.m + b.y * b.m) / m,
        vx: (a.vx * a.m + b.vx * b.m) / m,
        vy: (a.vy * a.m + b.vy * b.m) / m,
        color: big.color,
        m,
        r: radiusFor(m),
      });
      gone.add(j);
    }
  }
  return gone.size ? bs.filter((_, i) => !gone.has(i)) : bs;
}

export function centreOfMass(bs: Body[]) {
  let m = 0, x = 0, y = 0;
  for (const b of bs) {
    m += b.m;
    x += b.x * b.m;
    y += b.y * b.m;
  }
  return m ? { x: x / m, y: y / m } : { x: 0, y: 0 };
}

/** Speed for a circular orbit at distance `d` around mass `m`. */
export const orbitSpeed = (m: number, d: number) => Math.sqrt(m / d);

const STAR = '#ffc35a';
/** A body in a circular orbit around `host`, at distance `d` and angle `a` (anticlockwise). */
function moonOf(host: Body, d: number, a: number, m: number, color: string) {
  const v = orbitSpeed(host.m, d);
  return body(host.x + Math.cos(a) * d, host.y + Math.sin(a) * d, host.vx - Math.sin(a) * v, host.vy + Math.cos(a) * v, m, color);
}

export const PRESETS: { name: string; make: () => Body[] }[] = [
  {
    name: 'Solar system',
    make: () => {
      const sun = body(0, 0, 0, 0, 2000, STAR);
      const giant = moonOf(sun, 210, 2.2, 60, '#e8a86b');
      return [sun, moonOf(sun, 70, 0, 2, '#b9b2a8'), moonOf(sun, 120, 1, 8, '#e6c27a'), moonOf(sun, 160, 4, 10, '#5fa8ff'), giant, moonOf(giant, 16, 0, 0.5, '#d9d9d9'), moonOf(sun, 300, 5, 30, '#9fe3f0')];
    },
  },
  {
    name: 'Binary stars',
    make: () => {
      const v = Math.sqrt(800 / 240);
      const a = body(-60, 0, 0, -v, 800, STAR);
      const b = body(60, 0, 0, v, 800, '#ff8a5a');
      return [a, b, moonOf(body(0, 0, 0, 0, 1600, ''), 280, 1, 6, '#7ef0c8')];
    },
  },
  {
    name: 'Figure eight',
    // The Chenciner–Montgomery three-body choreography, scaled up.
    make: () => {
      const L = 120;
      const m = 100;
      const s = Math.sqrt(m / L);
      const [px, py, vx, vy] = [0.97000436 * L, -0.24308753 * L, -0.93240737 * s, -0.86473146 * s];
      return [body(px, py, -vx / 2, -vy / 2, m, '#ff6b9a'), body(-px, -py, -vx / 2, -vy / 2, m, '#6aa8ff'), body(0, 0, vx, vy, m, '#7ef0c8')];
    },
  },
  {
    name: 'Galaxy collision',
    make: () => {
      const a = body(-160, 0, 0.4, 0.9, 1500, STAR);
      const b = body(220, 120, -1.1, -0.6, 700, '#ff8a5a');
      const out = [a, b];
      for (let i = 0; i < 140; i++) out.push(moonOf(a, 40 + Math.random() * 130, Math.random() * Math.PI * 2, 0.01, '#9cc4ff'));
      for (let i = 0; i < 60; i++) out.push(moonOf(b, 30 + Math.random() * 70, Math.random() * Math.PI * 2, 0.01, '#ffc0a0'));
      return out;
    },
  },
  { name: 'Empty space', make: () => [body(0, 0, 0, 0, 2000, STAR)] },
];
