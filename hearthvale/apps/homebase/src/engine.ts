import { getImage } from './store.ts';
import type { Scene, SceneInput, ThemeDef } from './themes/types.ts';

export type Motion = 'auto' | 'full' | 'reduced' | 'off';
export type Quality = 'auto' | 'high' | 'balanced' | 'low';

const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Draws the active theme behind the page.
 * - Canvas sized to the device pixel ratio (capped at 2×) for sharp output on high-DPI screens.
 * - "Auto" quality lowers the render resolution if frames get slow, and raises it again when there's headroom.
 * - Stops completely while the tab is hidden; honours the OS "reduce motion" setting.
 * - Falls back to the theme's CSS background if WebGL isn't available.
 */
export class Background {
  private canvas: HTMLCanvasElement | null = null;
  private scene: Scene | null = null;
  private theme: ThemeDef | null = null;
  private raf = 0;
  private t = 0;
  private last = 0;
  private adapt = 1;
  private ema = 1 / 60;
  private slowFor = 0;
  private fastFor = 0;
  private photoUrl: string | null = null;
  private photo: HTMLDivElement;
  readonly failed = new Set<string>();

  constructor(private host: HTMLElement, private input: () => SceneInput, private opts: () => { motion: Motion; quality: Quality }) {
    this.photo = document.createElement('div');
    this.photo.className = 'bg-photo';
    host.append(this.photo);
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.play()));
    reduceQuery.addEventListener('change', () => this.play());
  }

  /** The motion setting after applying the device preference. */
  get motion(): Exclude<Motion, 'auto'> {
    const m = this.opts().motion;
    return m === 'auto' ? (reduceQuery.matches ? 'off' : 'full') : m;
  }

  setTheme(theme: ThemeDef) {
    this.stop();
    this.scene?.destroy();
    this.scene = null;
    this.canvas?.remove();
    this.canvas = null;
    this.theme = theme;
    this.adapt = 1;
    this.applyCss();
    if (theme.kind !== 'none' && theme.create && !this.failed.has(theme.id)) {
      const c = document.createElement('canvas');
      c.className = 'bg-canvas';
      c.setAttribute('aria-hidden', 'true');
      this.host.prepend(c);
      const scene = theme.create(c);
      if (scene) {
        this.canvas = c;
        this.scene = scene;
      } else {
        c.remove();
        this.failed.add(theme.id);
      }
    }
    void this.loadPhoto();
    this.resize();
    this.play();
  }

  /** CSS background: the theme's static look, shown behind/instead of the canvas. */
  applyCss() {
    const th = this.theme;
    if (!th) return;
    const { params, palette } = this.input();
    this.host.style.background = th.css ? th.css(params, palette) : palette.bg;
    if (th.usesImage) {
      this.photo.style.backgroundSize = String(params.fit ?? 'cover');
      this.photo.style.filter = `blur(${Number(params.blur ?? 0)}px)`;
      this.photo.style.setProperty('--shade', String(params.shade ?? 0.25));
    }
  }

  async loadPhoto() {
    const th = this.theme;
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
    this.photoUrl = null;
    this.photo.hidden = !th?.usesImage;
    if (!th?.usesImage) return;
    const blob = await getImage('background');
    if (this.theme !== th) return;
    this.photoUrl = blob ? URL.createObjectURL(blob) : null;
    this.photo.style.backgroundImage = this.photoUrl ? `url("${this.photoUrl}")` : 'none';
    this.photo.classList.toggle('empty', !this.photoUrl);
  }

  private pixelScale(): number {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const q = this.opts().quality;
    const base = q === 'high' ? 1 : q === 'balanced' ? 0.75 : q === 'low' ? 0.5 : this.theme?.kind === 'gl' ? 0.85 : 1;
    // Shaders cost per pixel, so cap them lower than particle scenes on very high-DPI screens.
    const cap = this.theme?.kind === 'gl' ? 1.5 : 2;
    return Math.max(0.35, Math.min(cap, dpr * base * (q === 'auto' ? this.adapt : 1)));
  }

  resize() {
    if (!this.canvas || !this.scene) return;
    const s = this.pixelScale();
    const w = Math.max(1, Math.round(innerWidth * s));
    const h = Math.max(1, Math.round(innerHeight * s));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.scene.resize(w, h, s);
    this.redraw();
  }

  /** Draw a single frame (used when animation is off, or after a settings change). */
  redraw() {
    if (!this.scene || this.raf) return;
    this.scene.frame(this.motion === 'off' ? 12 : this.t, 1 / 60, this.input());
  }

  play() {
    this.stop();
    if (!this.scene || document.hidden) return;
    if (this.motion === 'off') {
      this.redraw();
      return;
    }
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const slow = this.motion === 'reduced';
      this.t += dt * (slow ? 0.35 : 1);
      this.scene!.frame(this.t, dt * (slow ? 0.35 : 1), this.input());
      this.tune(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Auto quality: step the render resolution down when frames are slow, back up when fast. */
  private tune(dt: number) {
    if (this.opts().quality !== 'auto') return;
    this.ema = this.ema * 0.95 + dt * 0.05;
    if (this.ema > 1 / 45) { this.slowFor += dt; this.fastFor = 0; } else if (this.ema < 1 / 57) { this.fastFor += dt; this.slowFor = 0; }
    if (this.slowFor > 1.5 && this.adapt > 0.45) {
      this.adapt *= 0.8;
      this.slowFor = 0;
      this.resize();
    } else if (this.fastFor > 6 && this.adapt < 1) {
      this.adapt = Math.min(1, this.adapt * 1.15);
      this.fastFor = 0;
      this.resize();
    }
  }
}
