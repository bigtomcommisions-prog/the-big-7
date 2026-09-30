import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Blackjack, Poker, ThreeCard, createGame, type Action, type Game, type GameId, type Seat } from './index.ts';

const seats = (...chips: number[]): Seat[] => chips.map((c, i) => ({ id: `p${i}`, name: `P${i}`, chips: c }));
const sum = (ss: Seat[]) => ss.reduce((s, x) => s + x.chips, 0);
const rnd = (n: number) => Math.floor(Math.random() * n);

/** A random legal move from what the view offers. */
function randomAction(g: Game, id: string): Action {
  const o = g.view(id).options;
  const picks: Action[] = [];
  if (o.fold) picks.push({ type: 'fold' });
  if (o.check) picks.push({ type: 'check' }, { type: 'check' });
  if (o.call !== undefined) picks.push({ type: 'call' }, { type: 'call' });
  if (o.raise) picks.push({ type: 'raise', to: o.raise.min + rnd(o.raise.max - o.raise.min + 1) });
  if (o.bet) picks.push({ type: 'bet', amount: o.bet.min + rnd(o.bet.max - o.bet.min + 1) });
  for (const t of ['hit', 'stand', 'double', 'split', 'play'] as const) if (o[t]) picks.push({ type: t });
  if (o.draw) picks.push({ type: 'draw', discard: [0, 1, 2, 3, 4].filter(() => Math.random() < 0.3).slice(0, 3) });
  assert.ok(picks.length, `no options for ${id} in ${g.view(id).phase}`);
  return picks[rnd(picks.length)]!;
}

function playHand(g: Game, ss: Seat[]) {
  g.start(ss.filter((s) => s.chips >= g.minChips));
  for (let guard = 0; g.inHand; guard++) {
    assert.ok(guard < 500, 'hand never ended');
    const [id] = g.pending();
    assert.ok(id, 'nobody to act');
    if (Math.random() < 0.05) g.auto(id);
    else assert.equal(g.act(id, randomAction(g, id)), null);
  }
}

for (const [id, hands] of [['blackjack', 10_000], ['threecard', 3000], ['holdem', 3000], ['draw', 2000], ['nine', 2000]] as [GameId, number][]) {
  test(`${id}: ${hands} random hands keep every chip accounted for`, () => {
    const g = createGame(id);
    const n = Math.min(g.maxPlayers, 4);
    const ss = seats(...Array.from({ length: n }, () => 1000));
    const total = () => sum(ss) + ((g as { house?: number }).house ?? 0); // players plus the dealer's net
    for (let i = 0; i < hands; i++) {
      if (ss.filter((s) => s.chips >= g.minChips).length < g.minPlayers) for (const s of ss) s.chips += 1000;
      const before = total();
      playHand(g, ss);
      assert.equal(total(), before, `hand ${i}`);
      assert.ok(ss.every((s) => s.chips >= 0 && Number.isInteger(s.chips)));
    }
  });
}

test('hold’em: three-way all-in with side pots', () => {
  const g = new Poker('holdem');
  const ss = seats(100, 300, 500);
  // Hole cards go P0, P1, P2 in turn; then the board. P0 aces, P1 kings, P2 queens.
  g.start(ss, 'As Ad Ks Kd Qs Qd 2c 7h 9s Jd 3c'.split(' '));
  assert.deepEqual(g.pending(), ['p0']); // button P0, blinds P1 and P2
  assert.equal(g.act('p0', { type: 'raise', to: 100 }), null);
  assert.equal(g.act('p1', { type: 'raise', to: 300 }), null);
  assert.equal(g.act('p2', { type: 'call' }), null);
  assert.equal(g.inHand, false);
  assert.deepEqual(ss.map((s) => s.chips), [300, 400, 200]);
});

test('hold’em: split pot with the odd chip left of the button', () => {
  const g = new Poker('holdem');
  const ss = seats(100, 100, 101);
  g.start(ss, '2c 3d 4c 5d 6c 7d Ts Js Qs Ks As'.split(' ')); // royal flush on the board
  for (const [id, a] of [['p0', { type: 'raise', to: 41 }], ['p1', { type: 'call' }], ['p2', { type: 'call' }], ['p1', { type: 'raise', to: 21 }], ['p2', { type: 'call' }], ['p0', { type: 'fold' }]] as [string, Action][])
    assert.equal(g.act(id, a), null, `${id} ${a.type}`);
  while (g.inHand) g.auto(g.pending()[0]!);
  // Pot 165 split two ways: P1 is first left of the button, so takes the odd chip.
  assert.deepEqual(ss.map((s) => s.chips), [59, 121, 121]);
});

test('hold’em: heads-up blinds and a fold', () => {
  const g = new Poker('holdem');
  const ss = seats(500, 500);
  g.start(ss);
  assert.deepEqual(g.pending(), ['p0'], 'the button posts the small blind and acts first');
  g.act('p0', { type: 'fold' });
  assert.deepEqual(ss.map((s) => s.chips), [490, 510]);
  assert.equal(g.view('p1').players[0]!.cards[0], '??', 'folded cards stay hidden');
});

test('draw: discard limits and hidden cards', () => {
  const g = new Poker('draw');
  const ss = seats(500, 500);
  g.start(ss, 'As 2d 3h 4s 5c Kd Kh Ks 9c 8d Qc Qd Qh Qs Jc'.split(' '));
  assert.equal(g.view('p0').players[1]!.cards.join(), '??,??,??,??,??');
  g.act('p1', { type: 'check' });
  g.act('p0', { type: 'check' });
  assert.equal(g.view('p0').options.draw, true);
  assert.match(g.act('p1', { type: 'draw', discard: [0, 1, 2, 3] }) ?? '', /up to 3/);
  assert.equal(g.act('p0', { type: 'draw', discard: [1, 2, 3, 4] }), null, 'four when keeping an ace');
  assert.equal(g.act('p1', { type: 'draw', discard: [3, 4] }), null);
  assert.equal(g.view('p0').mine[0]!.cards.join(), 'As,Qc,Qd,Qh,Qs');
});

test('blackjack: dealer card stays face down until the end', () => {
  const g = new Blackjack();
  const ss = seats(1000);
  g.start(ss);
  g.act('p0', { type: 'bet', amount: 20 });
  const v = g.view('p0');
  if (g.inHand) assert.equal(v.dealer!.cards[1], '??');
  while (g.inHand) g.act('p0', { type: 'stand' });
  assert.notEqual(g.view('p0').dealer!.cards[1], '??');
  assert.equal(ss[0]!.chips + g.house, 1000);
});

test('three card poker: dealer cards hidden until settled', () => {
  const g = new ThreeCard();
  const ss = seats(1000);
  g.start(ss);
  assert.match(g.act('p0', { type: 'bet', amount: 600 }) ?? '', /between/);
  g.act('p0', { type: 'bet', amount: 50 });
  assert.equal(g.view('p0').dealer!.cards.join(), '??,??,??');
  g.act('p0', { type: 'play' });
  assert.equal(g.inHand, false);
  assert.equal(ss[0]!.chips + g.house, 1000);
});
