import { best, handName, handName3, newDeck, score3, shuffle, type Card } from './cards.ts';
import type { Action, Game, GameView, Options, Seat } from './types.ts';

type Variant = 'holdem' | 'draw' | 'nine' | 'threecard';

interface P {
  seat: Seat;
  cards: Card[];
  bet: number; // this betting round
  total: number; // this hand, antes included
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  drew: number | null;
}

const CFG = {
  holdem: { max: 9, hole: 2, ante: 0, sb: 10, bb: 20, streets: ['Pre-flop', 'Flop', 'Turn', 'River'] },
  draw: { max: 6, hole: 5, ante: 10, sb: 0, bb: 20, streets: ['First bet', 'Draw', 'Second bet'] },
  // Three-card hand ranks: straights beat flushes. Swap any of your three cards.
  threecard: { max: 6, hole: 3, ante: 10, sb: 0, bb: 20, streets: ['First bet', 'Draw', 'Second bet'] },
  // Placeholder rules until confirmed: five cards, bet, four more, bet, best five of nine.
  nine: { max: 5, hole: 5, ante: 10, sb: 0, bb: 20, streets: ['First bet', 'Second bet'] },
};

/** No-limit poker with antes or blinds, side pots and split pots. */
export class Poker implements Game {
  readonly maxPlayers: number;
  readonly minPlayers = 2;
  readonly minChips = 1;
  inHand = false;
  private cfg;
  private ps: P[] = [];
  private deck: Card[] = [];
  private muck: Card[] = [];
  private board: Card[] = [];
  private btn = -1;
  private street = 0;
  private toAct = -1;
  private currentBet = 0;
  private minRaise = 0;
  private done = false;
  private shown = false;
  private results: string[] = [];

  constructor(readonly id: Variant) {
    this.cfg = CFG[id];
    this.maxPlayers = this.cfg.max;
  }

  /** `deck` (dealt from the front) is for scripted tests. */
  start(seats: Seat[], deck?: Card[]) {
    const { cfg } = this;
    this.ps = seats.map((seat) => ({ seat, cards: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, drew: null }));
    const n = this.ps.length;
    this.btn = (this.btn + 1) % n;
    this.deck = deck ? [...deck] : shuffle(newDeck());
    this.muck = [];
    this.board = [];
    this.results = [];
    this.street = 0;
    this.done = this.shown = false;
    this.inHand = true;
    for (const p of this.ps) p.cards = this.take(cfg.hole);
    this.minRaise = cfg.bb;
    if (cfg.ante) for (const p of this.ps) this.post(p, cfg.ante, false);
    let first = this.btn;
    if (cfg.sb) {
      const sb = n === 2 ? this.btn : (this.btn + 1) % n; // heads-up: the button posts the small blind
      this.post(this.ps[sb]!, cfg.sb, true);
      this.post(this.ps[(sb + 1) % n]!, cfg.bb, true);
      this.currentBet = cfg.bb;
      first = (sb + 1) % n;
    } else this.currentBet = 0;
    this.advance(first);
  }

  private take(k: number): Card[] {
    if (this.deck.length < k) this.deck.push(...shuffle(this.muck.splice(0)));
    return this.deck.splice(0, k);
  }

  private post(p: P, amount: number, asBet: boolean) {
    const a = Math.min(amount, p.seat.chips);
    p.seat.chips -= a;
    p.total += a;
    if (asBet) p.bet += a;
    if (p.seat.chips === 0) p.allIn = true;
  }

  private get pot() {
    return this.ps.reduce((s, p) => s + p.total, 0);
  }

  private get drawing() {
    return this.cfg.streets[this.street] === 'Draw' && !this.done;
  }

  private nextActor(from: number): number {
    const n = this.ps.length;
    for (let k = 1; k <= n; k++) {
      const j = (from + k) % n;
      const p = this.ps[j]!;
      if (!p.folded && !p.allIn && (!p.acted || p.bet < this.currentBet)) return j;
    }
    return -1;
  }

  private roundDone(): boolean {
    const can = this.ps.filter((p) => !p.folded && !p.allIn);
    if (can.length === 0) return true;
    if (can.length === 1 && can[0]!.bet >= this.currentBet) return true;
    return can.every((p) => p.acted && p.bet === this.currentBet);
  }

  /** Moves play on after an action at seat `from`: next player, next street, or the end. */
  private advance(from: number) {
    for (;;) {
      const live = this.ps.filter((p) => !p.folded);
      if (live.length === 1) return this.finish([live[0]!]);
      if (!this.roundDone()) {
        this.toAct = this.nextActor(from);
        return;
      }
      for (const p of this.ps) {
        p.bet = 0;
        p.acted = false;
      }
      this.currentBet = 0;
      this.minRaise = this.cfg.bb;
      this.street++;
      if (this.street >= this.cfg.streets.length) return this.showdown();
      if (this.id === 'holdem') this.board.push(...this.take(this.street === 1 ? 3 : 1));
      if (this.id === 'nine') for (const p of live) p.cards.push(...this.take(4));
      if (this.drawing) {
        this.toAct = -1;
        return;
      }
      from = this.btn;
    }
  }

  act(seatId: string, a: Action): string | null {
    const i = this.ps.findIndex((p) => p.seat.id === seatId);
    const p = this.ps[i];
    if (!this.inHand || !p) return 'You are not in this hand.';
    if (this.drawing) return a.type === 'draw' ? this.draw(p, a.discard) : 'Choose cards to discard, or stand pat.';
    if (i !== this.toAct) return 'Not your turn.';
    const owe = this.currentBet - p.bet;
    switch (a.type) {
      case 'fold':
        p.folded = true;
        break;
      case 'check':
        if (owe > 0) return `You need to call ${owe}.`;
        break;
      case 'call':
        if (owe <= 0) return 'Nothing to call.';
        this.post(p, owe, true);
        break;
      case 'raise': {
        const max = p.bet + p.seat.chips;
        const to = a.to;
        if (!Number.isSafeInteger(to) || to > max || to <= this.currentBet) return 'Invalid amount.';
        if (to - this.currentBet < this.minRaise && to !== max) return `The minimum is ${this.currentBet + this.minRaise}.`;
        // ponytail: a short all-in raise reopens betting for everyone; strict rules only let callers call.
        this.minRaise = Math.max(this.minRaise, to - this.currentBet);
        this.currentBet = to;
        this.post(p, to - p.bet, true);
        for (const q of this.ps) if (q !== p) q.acted = false;
        break;
      }
      default:
        return 'You can’t do that now.';
    }
    p.acted = true;
    this.advance(i);
    return null;
  }

  private draw(p: P, discard: number[]): string | null {
    if (p.folded || p.drew !== null) return 'You have already drawn.';
    const idx = [...new Set(discard)];
    if (idx.some((x) => !Number.isInteger(x) || x < 0 || x >= p.cards.length)) return 'Invalid cards.';
    const kept = p.cards.filter((_, k) => !idx.includes(k));
    const limit = this.id === 'threecard' ? 3 : kept.length === 1 && kept[0]![0] === 'A' ? 4 : 3;
    if (idx.length > limit) return 'You can discard up to 3 cards, or 4 if you keep an Ace.';
    this.muck.push(...p.cards.filter((_, k) => idx.includes(k)));
    p.cards = [...kept, ...this.take(idx.length)];
    p.drew = idx.length;
    if (this.ps.every((q) => q.folded || q.drew !== null)) {
      this.street = 2;
      this.advance(this.btn);
    }
    return null;
  }

  pending(): string[] {
    if (!this.inHand) return [];
    if (this.drawing) return this.ps.filter((p) => !p.folded && p.drew === null).map((p) => p.seat.id);
    return this.toAct >= 0 ? [this.ps[this.toAct]!.seat.id] : [];
  }

  auto(seatId: string) {
    if (this.drawing) return void this.act(seatId, { type: 'draw', discard: [] });
    const p = this.ps.find((q) => q.seat.id === seatId);
    if (p) this.act(seatId, { type: p.bet >= this.currentBet ? 'check' : 'fold' });
  }

  private finish(winners: P[]) {
    const pot = this.pot;
    winners[0]!.seat.chips += pot;
    this.results = [`${winners[0]!.seat.name} wins ${pot}`];
    this.end();
  }

  private showdown() {
    this.shown = true;
    const live = this.ps.filter((p) => !p.folded);
    const score = new Map(live.map((p) => [p, this.rank([...p.cards, ...this.board])]));
    const won = new Map<P, number>();
    const levels = [...new Set(this.ps.map((p) => p.total))].filter((x) => x > 0).sort((a, b) => a - b);
    let prev = 0;
    for (const level of levels) {
      const amount = this.ps.reduce((s, p) => s + Math.min(p.total, level) - Math.min(p.total, prev), 0);
      prev = level;
      let eligible = live.filter((p) => p.total >= level);
      if (!eligible.length) eligible = live;
      const top = Math.max(...eligible.map((p) => score.get(p)!));
      // Order from the left of the button so any odd chip goes to the first winner there.
      const winners = eligible.filter((p) => score.get(p) === top).sort((a, b) => this.fromButton(a) - this.fromButton(b));
      const share = Math.floor(amount / winners.length);
      winners.forEach((w, k) => won.set(w, (won.get(w) ?? 0) + share + (k === 0 ? amount - share * winners.length : 0)));
    }
    for (const [p, amt] of won) p.seat.chips += amt;
    this.results = [...won].map(([p, amt]) => `${p.seat.name} wins ${amt} with ${this.name(score.get(p)!).toLowerCase()}`);
    this.end();
  }

  private rank(cards: Card[]) {
    return this.id === 'threecard' ? score3(cards) : best(cards);
  }

  private name(score: number) {
    return this.id === 'threecard' ? handName3(score) : handName(score);
  }

  private fromButton(p: P) {
    const n = this.ps.length;
    return (this.ps.indexOf(p) - this.btn - 1 + n) % n;
  }

  private end() {
    this.done = true;
    this.inHand = false;
    this.toAct = -1;
  }

  view(seatId: string): GameView {
    const me = this.ps.find((p) => p.seat.id === seatId);
    const phase = this.done ? (this.shown ? 'Showdown' : 'Hand over') : this.inHand ? this.cfg.streets[this.street]! : 'Waiting';
    const options: Options = {};
    if (me && this.inHand) {
      if (this.drawing && !me.folded && me.drew === null) options.draw = true;
      else if (this.ps[this.toAct] === me) {
        const owe = this.currentBet - me.bet;
        options.fold = true;
        if (owe <= 0) options.check = true;
        else options.call = Math.min(owe, me.seat.chips);
        const max = me.bet + me.seat.chips;
        if (me.seat.chips > owe) options.raise = { min: Math.min(this.currentBet + this.minRaise, max), max };
      }
    }
    const visible = me ? [...me.cards, ...this.board] : [];
    return {
      phase,
      pot: this.pot,
      board: this.board,
      dealer: null,
      players: this.ps.map((p, i) => ({
        id: p.seat.id,
        name: p.seat.name,
        chips: p.seat.chips,
        bet: p.bet,
        status: p.folded ? 'Folded' : p.allIn ? 'All in' : this.drawing && p.drew !== null ? `Drew ${p.drew}` : '',
        cards: p === me || (this.shown && !p.folded) ? p.cards : p.cards.map(() => '??'),
        turn: i === this.toAct || (this.drawing && !p.folded && p.drew === null),
        button: i === this.btn,
      })),
      mine: me ? [{ label: me.folded ? 'Folded' : 'Your hand', cards: me.cards, note: visible.length >= this.cfg.hole + (this.id === 'holdem' ? 3 : 0) ? this.name(this.rank(visible)) : undefined }] : [],
      options,
      results: this.results,
    };
  }
}
