import { randomInt } from 'node:crypto';

/** Rank then suit, e.g. 'As' (ace of spades), 'Td' (ten of diamonds). '??' is a face-down card. */
export type Card = string;

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';
export const rankOf = (c: Card) => RANKS.indexOf(c[0]!);

export function newDeck(decks = 1): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) out.push(r + s);
  return out;
}

/** Fisher-Yates with a cryptographic RNG, in place. */
export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const FIVE = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
const THREE = ['High card', 'Pair', 'Flush', 'Straight', 'Three of a kind', 'Straight flush'];

/** Category first, then tie-breaking ranks, packed so a bigger number is a better hand. */
function pack(cat: number, tiebreak: number[], width: number) {
  return tiebreak.reduce((s, r) => s * 13 + r, cat) * 13 ** (width - tiebreak.length);
}

function groups(ranks: number[]) {
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
}

/** Scores exactly five cards. */
export function score5(cards: Card[]): number {
  const r = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0]![1]);
  const g = groups(r);
  let high = -1;
  if (g.length === 5) {
    if (r[0]! - r[4]! === 4) high = r[0]!;
    else if (r[0] === 12 && r[1] === 3) high = 3; // the wheel, A-2-3-4-5
  }
  const [c1, c2] = [g[0]![1], g[1]?.[1]];
  const cat =
    high >= 0 && flush ? 8 : c1 === 4 ? 7 : c1 === 3 && c2 === 2 ? 6 : flush ? 5 : high >= 0 ? 4 : c1 === 3 ? 3 : c1 === 2 && c2 === 2 ? 2 : c1 === 2 ? 1 : 0;
  return pack(cat, high >= 0 ? [high] : g.map((x) => x[0]), 5);
}

/** The best five-card score from five to nine cards. */
export function best(cards: Card[]): number {
  let top = -1;
  const pick: Card[] = [];
  const walk = (from: number) => {
    if (pick.length === 5) return void (top = Math.max(top, score5(pick)));
    for (let i = from; i <= cards.length - (5 - pick.length); i++) {
      pick.push(cards[i]!);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return top;
}

export const handName = (score: number) => FIVE[Math.floor(score / 13 ** 5)]!;

/** Three Card Poker ranking: straights beat flushes, and A-2-3 is the lowest straight. */
export function score3(cards: Card[]): number {
  const r = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0]![1]);
  const g = groups(r);
  let high = -1;
  if (g.length === 3) {
    if (r[0]! - r[2]! === 2) high = r[0]!;
    else if (r[0] === 12 && r[1] === 1 && r[2] === 0) high = 1;
  }
  const cat = high >= 0 && flush ? 5 : g.length === 1 ? 4 : high >= 0 ? 3 : flush ? 2 : g.length === 2 ? 1 : 0;
  return pack(cat, high >= 0 ? [high] : g.map((x) => x[0]), 3);
}

export const handName3 = (score: number) => THREE[Math.floor(score / 13 ** 3)]!;
export const category3 = (score: number) => Math.floor(score / 13 ** 3);
