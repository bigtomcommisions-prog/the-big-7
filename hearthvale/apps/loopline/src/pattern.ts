import { DRUMS, SCALES, type DrumId, type Scale } from './sound.ts';

export const STEPS = 16;
export const NOTES = 8; // scale degrees shown in the bass grid, low to high

export interface Pattern {
  bpm: number;
  swing: number; // percent, 0–60
  scale: Scale;
  root: number; // 0 = C
  drums: Record<DrumId, boolean[]>;
  /** Scale degree per step (0–7), or -1 for a rest. */
  bass: number[];
  /** 0–9 for each drum, then the bass. */
  vols: number[];
}

const empty = () => Array<boolean>(STEPS).fill(false);
const steps = (on: number[]) => Array.from({ length: STEPS }, (_, i) => on.includes(i));

export function blank(): Pattern {
  return {
    bpm: 110, swing: 0, scale: 'minor', root: 9,
    drums: Object.fromEntries(DRUMS.map((d) => [d.id, empty()])) as Pattern['drums'],
    bass: Array<number>(STEPS).fill(-1),
    vols: [8, 7, 6, 5, 5, 6, 7],
  };
}

export const PRESETS: { name: string; make: () => Pattern }[] = [
  {
    name: 'House',
    make: () => ({
      ...blank(), bpm: 124,
      drums: { kick: steps([0, 4, 8, 12]), snare: empty(), clap: steps([4, 12]), hat: steps([2, 6, 10, 14]), open: steps([14]), tom: empty() },
      bass: [0, -1, 0, -1, -1, 0, -1, 3, 0, -1, 0, -1, -1, 4, -1, 2],
    }),
  },
  {
    name: 'Boom bap',
    make: () => ({
      ...blank(), bpm: 90, swing: 30, root: 2,
      drums: { kick: steps([0, 7, 8, 10]), snare: steps([4, 12]), clap: empty(), hat: steps([0, 2, 4, 6, 8, 10, 12, 14]), open: empty(), tom: steps([15]) },
      bass: [0, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, 4, -1, 3, -1],
    }),
  },
  {
    name: 'Breakbeat',
    make: () => ({
      ...blank(), bpm: 136, scale: 'dorian', root: 4,
      drums: { kick: steps([0, 3, 10]), snare: steps([4, 12, 15]), clap: empty(), hat: steps([0, 2, 4, 6, 8, 10, 12, 14]), open: steps([7]), tom: steps([13, 14]) },
      bass: [0, -1, -1, 0, -1, -1, 5, -1, -1, -1, 0, -1, 3, -1, 4, -1],
    }),
  },
  {
    name: 'Synthwave',
    make: () => ({
      ...blank(), bpm: 100, scale: 'minor', root: 9,
      drums: { kick: steps([0, 8]), snare: steps([4, 12]), clap: empty(), hat: steps([2, 6, 10, 14]), open: empty(), tom: empty() },
      bass: [0, 0, 7, 0, 0, 0, 7, 0, 5, 5, 7, 5, 6, 6, 7, 6],
    }),
  },
  { name: 'Empty', make: blank },
];

const SCALE_IDS = Object.keys(SCALES) as Scale[];

/** A compact, URL-safe text form: v1.bpm.swing.scale.root.drum-hex….bass.vols */
export function encode(p: Pattern): string {
  const hex = (s: boolean[]) => s.reduce((n, on, i) => n | (on ? 1 << i : 0), 0).toString(16).padStart(4, '0');
  return ['v1', p.bpm, p.swing, SCALE_IDS.indexOf(p.scale), p.root, DRUMS.map((d) => hex(p.drums[d.id])).join(''), p.bass.map((n) => n + 1).join(''), p.vols.join('')].join('.');
}

/** Parses `encode` output. Returns null for anything malformed. */
export function decode(s: string): Pattern | null {
  const m = /^v1\.(\d{2,3})\.(\d{1,2})\.([0-3])\.(\d{1,2})\.([0-9a-f]{24})\.([0-8]{16})\.([0-9]{7})$/.exec(s);
  if (!m) return null;
  const [bpm, swing, scale, root] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (bpm < 60 || bpm > 200 || swing > 60 || root > 11) return null;
  const drums = Object.fromEntries(DRUMS.map((d, k) => {
    const n = parseInt(m[5]!.slice(k * 4, k * 4 + 4), 16);
    return [d.id, Array.from({ length: STEPS }, (_, i) => (n & (1 << i)) !== 0)];
  })) as Pattern['drums'];
  return { bpm, swing, scale: SCALE_IDS[scale]!, root, drums, bass: [...m[6]!].map((c) => Number(c) - 1), vols: [...m[7]!].map(Number) };
}
