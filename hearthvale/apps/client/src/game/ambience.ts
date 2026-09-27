/**
 * Procedural ambient soundscape: a soft breeze plus occasional bird chirps, softened indoors.
 * Starts only after a user gesture (browser autoplay rules).
 */
export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private timer: number | undefined;
  private volume = 0.4;
  private indoors = false;

  start() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume * 0.5;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 6000;
    this.master.connect(this.filter).connect(ctx.destination);

    // Brown noise breeze
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 500;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0.25;
    src.connect(bp).connect(this.wind).connect(this.master);
    src.start();
    // Slow gusts
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain).connect(this.wind.gain);
    lfo.start();

    const chirpLoop = () => {
      this.chirp();
      this.timer = window.setTimeout(chirpLoop, 2500 + Math.random() * 7000);
    };
    this.timer = window.setTimeout(chirpLoop, 2000);
  }

  private chirp() {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.indoors) return;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 1800;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    pan.connect(this.master);
    for (let i = 0; i < notes; i++) {
      const t = ctx.currentTime + i * 0.13;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t + 0.07);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.2);
  }

  setIndoors(inside: boolean) {
    if (inside === this.indoors) return;
    this.indoors = inside;
    if (this.filter && this.ctx) this.filter.frequency.setTargetAtTime(inside ? 700 : 6000, this.ctx.currentTime, 0.3);
  }

  dispose() {
    clearTimeout(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }
}
