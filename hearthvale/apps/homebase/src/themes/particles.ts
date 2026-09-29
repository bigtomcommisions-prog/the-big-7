import { rgba } from '../dom.ts';
import type { Params, Scene, SceneInput } from './types.ts';

/** A 2D canvas scene. `setup` runs on resize and whenever a param in `rebuildOn` changes. */
interface Impl<S> {
  rebuildOn: string[];
  setup(w: number, h: number, scale: number, p: Params): S;
  draw(ctx: CanvasRenderingContext2D, s: S, w: number, h: number, scale: number, t: number, dt: number, p: Params): void;
}

function canvas2d<S>(canvas: HTMLCanvasElement, impl: Impl<S>): Scene | null {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return null;
  let w = 1, h = 1, scale = 1, state: S | null = null, key = '';
  return {
    resize(nw, nh, ns) {
      w = nw; h = nh; scale = ns; state = null;
    },
    frame(t, dt, { params }: SceneInput) {
      const k = impl.rebuildOn.map((r) => String(params[r])).join('|');
      if (!state || k !== key) {
        state = impl.setup(w, h, scale, params);
        key = k;
      }
      impl.draw(ctx, state, w, h, scale, t, Math.min(dt, 0.1), params);
    },
    destroy() {},
  };
}

const n = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
const s = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Pre-rendered soft glow sprite (much cheaper than per-particle gradients). */
function glowSprite(color: string, size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, rgba(color, 1));
  grad.addColorStop(0.25, rgba(color, 0.55));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function vGradient(ctx: CanvasRenderingContext2D, h: number, top: string, bottom: string) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}

// ── Warp speed ────────────────────────────────────────────────────────────────────────────────
export const warp = (canvas: HTMLCanvasElement) => canvas2d(canvas, {
  rebuildOn: ['density'],
  setup(w, h, _sc, p) {
    const count = Math.round((w * h) / 9000 * n(p.density, 1));
    return { stars: Array.from({ length: Math.min(count, 1600) }, () => ({ x: rand(-1, 1), y: rand(-1, 1), z: Math.random() })) };
  },
  draw(ctx, st, w, h, sc, _t, dt, p) {
    ctx.fillStyle = s(p.bg, '#02030a');
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, f = Math.max(w, h) * 0.5;
    const v = n(p.speed, 1) * 0.35 * dt;
    const color = s(p.star, '#cfd8ff');
    ctx.lineCap = 'round';
    for (const star of st.stars) {
      const pz = star.z;
      star.z -= v;
      if (star.z <= 0.02) { star.x = rand(-1, 1); star.y = rand(-1, 1); star.z = 1; continue; }
      const x = cx + (star.x / star.z) * f, y = cy + (star.y / star.z) * f;
      if (x < -50 || x > w + 50 || y < -50 || y > h + 50) { star.z = 1; continue; }
      const a = Math.min(1, (1 - star.z) * 1.4);
      ctx.strokeStyle = rgba(color, a);
      ctx.lineWidth = Math.max(0.6, (1 - star.z) * 2.6 * sc);
      ctx.beginPath();
      if (p.trails !== false) {
        const zz = Math.min(1, pz + v * 5);
        ctx.moveTo(cx + (star.x / zz) * f, cy + (star.y / zz) * f);
      } else ctx.moveTo(x - 0.1, y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  },
});

// ── Digital rain ──────────────────────────────────────────────────────────────────────────────
const CHARSETS: Record<string, string> = {
  katakana: 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789',
  binary: '01',
  hex: '0123456789ABCDEF',
  latin: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$+-*/=%"#&_(),.;:?!',
};
export const rain = (canvas: HTMLCanvasElement) => canvas2d(canvas, {
  rebuildOn: ['density', 'charset'],
  setup(w, h, sc, p) {
    const size = Math.round(18 * sc / Math.max(0.5, n(p.density, 1)));
    const cols = Math.ceil(w / size);
    return { size, drops: Array.from({ length: cols }, () => rand(-h / size, 0)), acc: 0, cleared: false, chars: CHARSETS[s(p.charset, 'katakana')] ?? CHARSETS.katakana! };
  },
  draw(ctx, st, w, h, _sc, _t, dt, p) {
    const bg = s(p.bg, '#010401');
    if (!st.cleared) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); st.cleared = true; }
    st.acc += dt * n(p.speed, 1) * 18;
    const color = s(p.glyph, '#35ff6b');
    ctx.font = `${st.size}px 'JetBrains Mono Variable', monospace`;
    ctx.textAlign = 'center';
    while (st.acc >= 1) {
      st.acc -= 1;
      ctx.fillStyle = rgba(bg, 0.09);
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < st.drops.length; i++) {
        const y = st.drops[i]! * st.size;
        const ch = st.chars[Math.floor(Math.random() * st.chars.length)]!;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fillText(ch, i * st.size + st.size / 2, y);
        if (p.glow !== false) { ctx.fillStyle = '#e8ffe8'; ctx.globalAlpha = 0.9; ctx.fillText(ch, i * st.size + st.size / 2, y + st.size); }
        ctx.globalAlpha = 1;
        st.drops[i]! += 1;
        if (y > h && Math.random() > 0.975) st.drops[i] = rand(-20, 0);
      }
    }
  },
});

// ── Fireflies over a forest ───────────────────────────────────────────────────────────────────
export const fireflies = (canvas: HTMLCanvasElement) => canvas2d(canvas, {
  rebuildOn: ['count', 'fly'],
  setup(w, h, sc, p) {
    const trees = new Path2D();
    const layer = (y0: number, hmax: number) => {
      const path = new Path2D();
      path.moveTo(0, h);
      for (let x = -20 * sc; x < w + 40 * sc; x += rand(18, 42) * sc) {
        const th = rand(0.5, 1) * hmax;
        path.lineTo(x, y0);
        path.lineTo(x + 14 * sc, y0 - th);
        path.lineTo(x + 28 * sc, y0);
      }
      path.lineTo(w, h);
      path.closePath();
      return path;
    };
    trees.addPath(layer(h * 0.9, h * 0.35));
    return {
      far: layer(h * 0.82, h * 0.22), near: trees,
      sprite: glowSprite(s(p.fly, '#ffe98a')),
      flies: Array.from({ length: Math.round(n(p.count, 60) * Math.min(2, (w * h) / 1.5e6)) }, () => ({ x: rand(0, w), y: rand(h * 0.25, h), a: rand(0, 6.28), ph: rand(0, 6.28), r: rand(3, 7) * sc })),
    };
  },
  draw(ctx, st, w, h, sc, t, dt, p) {
    ctx.fillStyle = vGradient(ctx, h, s(p.top, '#050b1a'), s(p.bottom, '#0d2a26'));
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgba(s(p.trees, '#040a0a'), 0.75);
    ctx.fill(st.far);
    const speed = n(p.speed, 1) * 18 * sc;
    for (const f of st.flies) {
      f.a += (Math.random() - 0.5) * 2 * dt;
      f.x += Math.cos(f.a) * speed * dt;
      f.y += Math.sin(f.a) * speed * dt * 0.6;
      if (f.x < -20) f.x = w + 20; if (f.x > w + 20) f.x = -20;
      if (f.y < h * 0.2) f.a = Math.PI / 2; if (f.y > h) f.a = -Math.PI / 2;
      const glow = 0.25 + 0.75 * Math.max(0, Math.sin(t * 1.4 + f.ph));
      const size = f.r * 6 * (0.6 + glow * 0.6);
      ctx.globalAlpha = glow;
      ctx.drawImage(st.sprite, f.x - size / 2, f.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = s(p.trees, '#040a0a');
    ctx.fill(st.near);
  },
});

// ── Snowfall ──────────────────────────────────────────────────────────────────────────────────
export const snow = (canvas: HTMLCanvasElement) => canvas2d(canvas, {
  rebuildOn: ['density'],
  setup(w, h, sc, p) {
    const count = Math.round((w * h) / 6000 * n(p.density, 1));
    return { flakes: Array.from({ length: Math.min(count, 1400) }, () => { const d = Math.random(); return { x: rand(0, w), y: rand(0, h), d, r: (0.8 + d * 2.8) * sc, ph: rand(0, 6.28) }; }) };
  },
  draw(ctx, st, w, h, sc, t, dt, p) {
    ctx.fillStyle = vGradient(ctx, h, s(p.top, '#1a2740'), s(p.bottom, '#5d6f8f'));
    ctx.fillRect(0, 0, w, h);
    const color = s(p.flake, '#ffffff');
    const wind = n(p.wind, 0.3) * 40 * sc;
    const size = n(p.size, 1);
    for (const f of st.flakes) {
      f.y += (18 + f.d * 42) * sc * dt * n(p.speed, 1);
      f.x += (wind * (0.4 + f.d) + Math.sin(t * 0.8 + f.ph) * 12 * sc) * dt;
      if (f.y > h + 5) { f.y = -5; f.x = rand(0, w); }
      if (f.x > w + 5) f.x = -5; if (f.x < -5) f.x = w + 5;
      ctx.globalAlpha = 0.35 + f.d * 0.6;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
});

// ── Sakura petals ─────────────────────────────────────────────────────────────────────────────
export const sakura = (canvas: HTMLCanvasElement) => canvas2d(canvas, {
  rebuildOn: ['density'],
  setup(w, h, sc, p) {
    const count = Math.round((w * h) / 22000 * n(p.density, 1));
    return { petals: Array.from({ length: Math.min(count, 400) }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(5, 11) * sc, rot: rand(0, 6.28), spin: rand(-1.5, 1.5), flip: rand(0, 6.28), fs: rand(1, 3), v: rand(20, 45), alt: Math.random() < 0.4 })) };
  },
  draw(ctx, st, w, h, sc, _t, dt, p) {
    ctx.fillStyle = vGradient(ctx, h, s(p.top, '#fde7ef'), s(p.bottom, '#f5f0ff'));
    ctx.fillRect(0, 0, w, h);
    const wind = n(p.wind, 0.5) * 50 * sc;
    const c1 = s(p.petal, '#f7a8c4'), c2 = s(p.petal2, '#fbd3e1');
    for (const pt of st.petals) {
      pt.y += pt.v * sc * dt * n(p.speed, 1);
      pt.x += (wind + Math.sin(pt.flip) * 20 * sc) * dt;
      pt.rot += pt.spin * dt;
      pt.flip += pt.fs * dt;
      if (pt.y > h + 20) { pt.y = -20; pt.x = rand(-w * 0.2, w); }
      if (pt.x > w + 20) pt.x = -20;
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rot);
      ctx.scale(Math.cos(pt.flip), 1);
      ctx.fillStyle = pt.alt ? c2 : c1;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(0, 0, pt.r, pt.r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
});

// ── City rain & bokeh ─────────────────────────────────────────────────────────────────────────
export const bokeh = (canvas: HTMLCanvasElement) => canvas2d(canvas, {
  rebuildOn: ['lights', 'c1', 'c2', 'c3', 'rain'],
  setup(w, h, sc, p) {
    const colors = [s(p.c1, '#ff9a3c'), s(p.c2, '#ff4f7a'), s(p.c3, '#4fb8ff')];
    const sprites = colors.map((c) => glowSprite(c, 128));
    const count = Math.round(n(p.lights, 40) * Math.min(2, (w * h) / 1.5e6));
    return {
      lights: Array.from({ length: count }, () => ({ x: rand(0, w), y: rand(h * 0.15, h * 0.95), r: rand(20, 70) * sc, sp: sprites[Math.floor(Math.random() * 3)]!, ph: rand(0, 6.28), v: rand(-6, 6) * sc })),
      drops: Array.from({ length: Math.round((w * h) / 9000 * n(p.rain, 1)) }, () => ({ x: rand(0, w), y: rand(0, h), l: rand(10, 26) * sc, v: rand(600, 1000) * sc })),
    };
  },
  draw(ctx, st, w, h, sc, t, dt, p) {
    ctx.fillStyle = vGradient(ctx, h, s(p.top, '#07080f'), s(p.bottom, '#1a1226'));
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of st.lights) {
      l.x += l.v * dt;
      if (l.x < -80) l.x = w + 80; if (l.x > w + 80) l.x = -80;
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 0.6 + l.ph);
      ctx.drawImage(l.sp, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = s(p.drop, '#b9c7ff');
    ctx.lineWidth = Math.max(1, sc);
    ctx.beginPath();
    const slant = 0.18;
    for (const d of st.drops) {
      d.y += d.v * dt;
      d.x += d.v * slant * dt;
      if (d.y > h) { d.y = -d.l; d.x = rand(-w * 0.2, w); }
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.l * slant, d.y - d.l);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  },
});

// ── Ocean sunset ──────────────────────────────────────────────────────────────────────────────
export const ocean = (canvas: HTMLCanvasElement) => canvas2d(canvas, {
  rebuildOn: [],
  setup: () => ({}),
  draw(ctx, _st, w, h, sc, t, _dt, p) {
    const horizon = h * 0.55;
    ctx.fillStyle = vGradient(ctx, horizon, s(p.skyTop, '#2b1b4a'), s(p.skyBottom, '#ff9a6b'));
    ctx.fillRect(0, 0, w, horizon);
    const sun = s(p.sun, '#ffd27a');
    const sr = Math.min(w, h) * 0.09;
    const sy = horizon - sr * 0.35;
    const glow = ctx.createRadialGradient(w / 2, sy, sr * 0.5, w / 2, sy, sr * 5);
    glow.addColorStop(0, rgba(sun, 0.55));
    glow.addColorStop(1, rgba(sun, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, horizon);
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(w / 2, sy, sr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = vGradient(ctx, h, s(p.water, '#16304f'), s(p.deep, '#070d1c'));
    ctx.fillRect(0, horizon, w, h - horizon);
    // Sun glitter on the water
    ctx.fillStyle = rgba(sun, 0.5);
    for (let i = 0; i < 70; i++) {
      const yy = horizon + ((i * 37) % 100) / 100 * (h - horizon) * 0.8;
      const spread = (yy - horizon) * 0.35 + sr * 0.5;
      const xx = w / 2 + Math.sin(i * 12.9 + t * 1.3) * spread;
      ctx.fillRect(xx, yy, (6 + (i % 5) * 4) * sc, 1.5 * sc);
    }
    const amp = n(p.waves, 1) * 14 * sc;
    const speed = n(p.speed, 1);
    const water = s(p.water, '#16304f');
    for (let layer = 0; layer < 5; layer++) {
      const base = horizon + (h - horizon) * (0.18 + layer * 0.19);
      ctx.fillStyle = rgba(water, 0.35 + layer * 0.12);
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8 * sc) {
        const y = base + Math.sin(x / (160 * sc) + t * speed * (0.6 + layer * 0.15) + layer) * amp * (0.6 + layer * 0.25)
          + Math.sin(x / (53 * sc) - t * speed * 0.9 + layer * 2) * amp * 0.3;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
  },
});
