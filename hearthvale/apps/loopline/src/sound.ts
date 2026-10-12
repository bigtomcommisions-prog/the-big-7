// Every sound is synthesised with the Web Audio API, so there are no samples to licence or download.
// Each voice takes the context and output node, so the same code plays live and renders to WAV.

export const DRUMS = [
  { id: 'kick', name: 'Kick' },
  { id: 'snare', name: 'Snare' },
  { id: 'clap', name: 'Clap' },
  { id: 'hat', name: 'Closed hat' },
  { id: 'open', name: 'Open hat' },
  { id: 'tom', name: 'Tom' },
] as const;
export type DrumId = (typeof DRUMS)[number]['id'];

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(ac: BaseAudioContext): AudioBufferSourceNode {
  let buf = noiseBuffers.get(ac);
  if (!buf) {
    buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ac, buf);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  return src;
}

/** A gain node that rises instantly to `peak` and decays to silence over `len` seconds. */
function env(ac: BaseAudioContext, out: AudioNode, t: number, peak: number, len: number): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  g.connect(out);
  return g;
}

function tone(ac: BaseAudioContext, out: AudioNode, t: number, type: OscillatorType, from: number, to: number, sweep: number, peak: number, len: number) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + sweep);
  o.connect(env(ac, out, t, peak, len));
  o.start(t);
  o.stop(t + len + 0.02);
}

function hiss(ac: BaseAudioContext, out: AudioNode, t: number, filter: BiquadFilterType, freq: number, peak: number, len: number) {
  const n = noise(ac);
  const f = ac.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  n.connect(f).connect(env(ac, out, t, peak, len));
  n.start(t);
  n.stop(t + len + 0.02);
}

export function drum(ac: BaseAudioContext, out: AudioNode, id: DrumId, t: number, vol: number) {
  switch (id) {
    case 'kick':
      return tone(ac, out, t, 'sine', 150, 42, 0.12, vol, 0.42);
    case 'snare':
      tone(ac, out, t, 'triangle', 220, 160, 0.08, vol * 0.5, 0.12);
      return hiss(ac, out, t, 'highpass', 1200, vol * 0.7, 0.18);
    case 'clap':
      for (const d of [0, 0.012, 0.026]) hiss(ac, out, t + d, 'bandpass', 1500, vol * 0.8, d === 0.026 ? 0.2 : 0.03);
      return;
    case 'hat':
      return hiss(ac, out, t, 'highpass', 7500, vol * 0.45, 0.05);
    case 'open':
      return hiss(ac, out, t, 'highpass', 7000, vol * 0.4, 0.32);
    case 'tom':
      return tone(ac, out, t, 'sine', 180, 95, 0.2, vol * 0.8, 0.3);
  }
}

export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10, 12],
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  pentatonic: [0, 3, 5, 7, 10, 12, 15, 17],
  dorian: [0, 2, 3, 5, 7, 9, 10, 12],
} as const;
export type Scale = keyof typeof SCALES;
export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** A bass note: a detuned saw pair through a low-pass filter that closes quickly. */
export function bass(ac: BaseAudioContext, out: AudioNode, t: number, len: number, root: number, scale: Scale, degree: number, vol: number) {
  const midi = 36 + root + SCALES[scale][degree]!; // C2 upwards
  const freq = 440 * 2 ** ((midi - 69) / 12);
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 6;
  f.frequency.setValueAtTime(2200, t);
  f.frequency.exponentialRampToValueAtTime(260, t + len * 0.9);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol * 0.32, t + 0.005);
  g.gain.setTargetAtTime(0, t + len * 0.85, 0.02);
  f.connect(g).connect(out);
  for (const detune of [-7, 7]) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(f);
    o.start(t);
    o.stop(t + len + 0.1);
  }
}

/** Master chain: gain into a gentle compressor so stacked hits don't clip. */
export function master(ac: BaseAudioContext, vol = 0.8): GainNode {
  const g = ac.createGain();
  g.gain.value = vol;
  const c = ac.createDynamicsCompressor();
  c.threshold.value = -10;
  c.ratio.value = 4;
  g.connect(c).connect(ac.destination);
  return g;
}

/** 16-bit PCM WAV from a rendered buffer. */
export function wav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const frames = buf.length;
  const data = new DataView(new ArrayBuffer(44 + frames * ch * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  data.setUint32(4, 36 + frames * ch * 2, true);
  str(8, 'WAVEfmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, buf.sampleRate, true);
  data.setUint32(28, buf.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  str(36, 'data');
  data.setUint32(40, frames * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (const d of chans) {
      const s = Math.max(-1, Math.min(1, d[i]!));
      data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([data], { type: 'audio/wav' });
}
