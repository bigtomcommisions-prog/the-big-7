import { category3, handName3, newDeck, score3, shuffle, type Card } from './cards.ts';
import type { Action, Game, GameView, Options, PlayerView, Seat } from './types.ts';

const MIN_BET = 10;
const MAX_BET = 500;

/** The shared betting phase for games against the dealer. `house` is the dealer's net result. */
abstract class HouseGame<P extends { seat: Seat; bet: number | null }> implements Game {
  abstract readonly id: 'blackjack' | 'threecard';
  abstract readonly maxPlayers: number;
  readonly minPlayers = 1;
  abstract readonly minChips: number;
  inHand = false;
  house = 0;
  protected ps: P[] = [];
  protected dealer: Card[] = [];
  protected phase: 'bet' | 'play' | 'done' = 'done';
  protected results: string[] = [];

  protected abstract player(seat: Seat): P;
  protected abstract deal(): void;
  protected abstract maxBet(p: P): number;

  start(seats: Seat[]) {
    this.ps = seats.map((s) => this.player(s));
    this.dealer = [];
    this.results = [];
    this.phase = 'bet';
    this.inHand = true;
  }

  protected placeBet(p: P, a: Action): string | null {
    if (p.bet !== null) return 'You have already bet.';
    if (a.type !== 'bet') return 'Place a bet first.';
    const max = this.maxBet(p);
    if (!Number.isSafeInteger(a.amount) || a.amount < MIN_BET || a.amount > max) return `Bet between ${MIN_BET} and ${max}.`;
    p.bet = a.amount;
    p.seat.chips -= a.amount;
    this.house += a.amount;
    this.afterBet();
    return null;
  }

  protected afterBet() {
    if (this.ps.some((p) => p.bet === null)) return;
    this.ps = this.ps.filter((p) => p.bet! > 0);
    if (!this.ps.length) return this.end();
    this.phase = 'play';
    this.deal();
  }

  protected pay(p: P, amount: number) {
    p.seat.chips += amount;
    this.house -= amount;
  }

  protected end() {
    this.phase = 'done';
    this.inHand = false;
  }

  protected find(id: string) {
    return this.ps.find((p) => p.seat.id === id);
  }

  abstract act(seatId: string, a: Action): string | null;
  abstract pending(): string[];
  abstract auto(seatId: string): void;
  abstract view(seatId: string): GameView;

  protected betOptions(p: P | undefined): Options {
    return p && this.phase === 'bet' && p.bet === null ? { bet: { min: MIN_BET, max: this.maxBet(p) } } : {};
  }

  protected betting(): string[] {
    return this.phase === 'bet' ? this.ps.filter((p) => p.bet === null).map((p) => p.seat.id) : [];
  }

  protected phaseName(play: string) {
    return this.phase === 'bet' ? 'Place your bets' : this.phase === 'play' ? play : this.inHand ? '' : this.results.length ? 'Hand over' : 'Waiting';
  }
}

// ---------------------------------------------------------------- Blackjack

interface BHand {
  cards: Card[];
  bet: number;
  done: boolean;
  split: boolean;
  result?: string;
}
interface BP {
  seat: Seat;
  bet: number | null;
  hands: BHand[];
}

const value = (c: Card) => (c[0] === 'A' ? 11 : 'TJQK'.includes(c[0]!) ? 10 : Number(c[0]));

export function total(cards: Card[]): { total: number; soft: boolean } {
  let t = 0;
  let aces = 0;
  for (const c of cards) {
    t += value(c);
    if (c[0] === 'A') aces++;
  }
  while (t > 21 && aces) {
    t -= 10;
    aces--;
  }
  return { total: t, soft: aces > 0 };
}

const isNatural = (h: { cards: Card[]; split?: boolean }) => !h.split && h.cards.length === 2 && total(h.cards).total === 21;

/** Six-deck shoe, dealer stands on all 17s, blackjack pays 3:2, double on any two, split once, no insurance. */
export class Blackjack extends HouseGame<BP> {
  readonly id = 'blackjack';
  readonly maxPlayers = 5;
  readonly minChips = MIN_BET;
  private shoe: Card[] = [];
  private turn = { p: -1, h: 0 };

  protected player(seat: Seat): BP {
    return { seat, bet: null, hands: [] };
  }

  protected maxBet(p: BP) {
    return Math.min(MAX_BET, p.seat.chips);
  }

  private draw(): Card {
    return this.shoe.pop()!;
  }

  override start(seats: Seat[]) {
    if (this.shoe.length < 78) this.shoe = shuffle(newDeck(6)); // reshuffle at a quarter of the shoe
    this.turn = { p: -1, h: 0 };
    super.start(seats);
  }

  protected deal() {
    for (const p of this.ps) p.hands = [{ cards: [this.draw(), this.draw()], bet: p.bet!, done: false, split: false }];
    this.dealer = [this.draw(), this.draw()];
    // The dealer peeks: a dealer blackjack ends the hand at once.
    if (isNatural({ cards: this.dealer })) return this.settle();
    for (const p of this.ps) if (isNatural(p.hands[0]!)) p.hands[0]!.done = true;
    this.nextTurn();
  }

  private nextTurn() {
    for (let p = Math.max(this.turn.p, 0); p < this.ps.length; p++) {
      const h = this.ps[p]!.hands.findIndex((x) => !x.done);
      if (h >= 0) return void (this.turn = { p, h });
    }
    this.turn = { p: -1, h: 0 };
    this.settle();
  }

  private settle() {
    const dealerNat = isNatural({ cards: this.dealer });
    const live = this.ps.some((p) => p.hands.some((h) => total(h.cards).total <= 21 && !isNatural(h)));
    if (!dealerNat && live) while (total(this.dealer).total < 17) this.dealer.push(this.draw());
    const d = total(this.dealer).total;
    this.results = [];
    for (const p of this.ps) {
      for (const h of p.hands) {
        const t = total(h.cards).total;
        const nat = isNatural(h);
        let back = 0;
        if (nat && !dealerNat) back = h.bet + Math.floor(h.bet * 1.5);
        else if (nat && dealerNat) back = h.bet;
        else if (dealerNat || t > 21) back = 0;
        else if (d > 21 || t > d) back = h.bet * 2;
        else if (t === d) back = h.bet;
        this.pay(p, back);
        h.done = true;
        h.result = nat && !dealerNat ? `Blackjack! +${back - h.bet}` : back > h.bet ? `Win +${back - h.bet}` : back === h.bet ? 'Push' : t > 21 ? `Bust −${h.bet}` : `Lose −${h.bet}`;
        this.results.push(`${p.seat.name}: ${h.result}`);
      }
    }
    this.end();
  }

  act(seatId: string, a: Action): string | null {
    const p = this.find(seatId);
    if (!this.inHand || !p) return 'You are not in this hand.';
    if (this.phase === 'bet') return this.placeBet(p, a);
    if (this.ps[this.turn.p] !== p) return 'Not your turn.';
    const h = p.hands[this.turn.h]!;
    const two = h.cards.length === 2;
    switch (a.type) {
      case 'hit':
        h.cards.push(this.draw());
        if (total(h.cards).total >= 21) h.done = true;
        break;
      case 'stand':
        h.done = true;
        break;
      case 'double':
        if (!two || p.seat.chips < h.bet) return 'You can’t double now.';
        p.seat.chips -= h.bet;
        this.house += h.bet;
        h.bet *= 2;
        h.cards.push(this.draw());
        h.done = true;
        break;
      case 'split': {
        if (!two || p.hands.length > 1 || value(h.cards[0]!) !== value(h.cards[1]!) || p.seat.chips < h.bet) return 'You can’t split now.';
        p.seat.chips -= h.bet;
        this.house += h.bet;
        const aces = h.cards[0]![0] === 'A';
        p.hands = h.cards.map((c) => ({ cards: [c, this.draw()], bet: h.bet, done: aces, split: true }));
        for (const x of p.hands) if (total(x.cards).total === 21) x.done = true;
        break;
      }
      default:
        return 'You can’t do that now.';
    }
    this.nextTurn();
    return null;
  }

  pending(): string[] {
    if (this.phase === 'play' && this.turn.p >= 0) return [this.ps[this.turn.p]!.seat.id];
    return this.betting();
  }

  auto(seatId: string) {
    const p = this.find(seatId);
    if (!p) return;
    if (this.phase === 'bet') {
      p.bet = 0; // sits this hand out
      return this.afterBet();
    }
    this.act(seatId, { type: 'stand' });
  }

  view(seatId: string): GameView {
    const me = this.find(seatId);
    const hidden = this.phase === 'play';
    const options = this.betOptions(me);
    if (me && this.phase === 'play' && this.ps[this.turn.p] === me) {
      const h = me.hands[this.turn.h]!;
      Object.assign(options, { hit: true, stand: true });
      if (h.cards.length === 2 && me.seat.chips >= h.bet) {
        options.double = true;
        if (me.hands.length === 1 && value(h.cards[0]!) === value(h.cards[1]!)) options.split = true;
      }
    }
    const describe = (h: BHand) => {
      const { total: t, soft } = total(h.cards);
      return h.result ?? (isNatural(h) ? 'Blackjack' : t > 21 ? `Bust (${t})` : `${soft && t < 21 ? 'Soft ' : ''}${t}`);
    };
    const players: PlayerView[] = this.ps.map((p, i) => ({
      id: p.seat.id,
      name: p.seat.name,
      chips: p.seat.chips,
      bet: p.hands.reduce((s, h) => s + h.bet, 0) || (p.bet ?? 0),
      status: p.bet === null ? 'Betting…' : p.hands.map(describe).join(' · '),
      cards: p.hands.flatMap((h) => h.cards),
      turn: this.phase === 'bet' ? p.bet === null : i === this.turn.p,
    }));
    const dealerCards = hidden ? [this.dealer[0]!, '??'] : this.dealer;
    return {
      phase: this.phaseName('Your move'),
      pot: players.reduce((s, p) => s + p.bet, 0),
      board: [],
      dealer: this.dealer.length ? { cards: dealerCards, note: hidden ? `Shows ${total([this.dealer[0]!]).total}` : describe({ cards: this.dealer, bet: 0, done: true, split: false }) } : null,
      players,
      mine: (me?.hands ?? []).map((h, k, all) => ({
        label: all.length > 1 ? `Hand ${k + 1} · bet ${h.bet}` : `Bet ${h.bet}`,
        cards: h.cards,
        note: describe(h),
        active: this.phase === 'play' && this.ps[this.turn.p] === me && this.turn.h === k,
      })),
      options,
      results: this.results,
    };
  }
}

// ---------------------------------------------------------------- Three Card Poker

interface TP {
  seat: Seat;
  bet: number | null; // the ante
  cards: Card[];
  play: boolean | null;
  result?: string;
}

/** Ante then Play or fold. Dealer qualifies with Queen-high. Ante bonus: straight 1, trips 4, straight flush 5. */
export class ThreeCard extends HouseGame<TP> {
  readonly id = 'threecard';
  readonly maxPlayers = 6;
  readonly minChips = MIN_BET * 2;

  protected player(seat: Seat): TP {
    return { seat, bet: null, cards: [], play: null };
  }

  protected maxBet(p: TP) {
    return Math.min(MAX_BET, Math.floor(p.seat.chips / 2)); // keep enough back for the Play bet
  }

  protected deal() {
    const deck = shuffle(newDeck());
    for (const p of this.ps) p.cards = deck.splice(0, 3);
    this.dealer = deck.splice(0, 3);
  }

  act(seatId: string, a: Action): string | null {
    const p = this.find(seatId);
    if (!this.inHand || !p) return 'You are not in this hand.';
    if (this.phase === 'bet') return this.placeBet(p, a);
    if (p.play !== null) return 'You have already decided.';
    if (a.type === 'play') {
      p.seat.chips -= p.bet!;
      this.house += p.bet!;
      p.play = true;
    } else if (a.type === 'fold') p.play = false;
    else return 'Play or fold.';
    if (this.ps.every((q) => q.play !== null)) this.settle();
    return null;
  }

  private settle() {
    const ds = score3(this.dealer);
    const qualifies = ds >= score3(['Qs', '3h', '2d']);
    this.results = [];
    for (const p of this.ps) {
      const ante = p.bet!;
      if (!p.play) {
        p.result = `Fold −${ante}`;
      } else {
        const ps = score3(p.cards);
        const bonus = [0, 0, 0, 1, 4, 5][category3(ps)]! * ante;
        const main = !qualifies ? ante * 3 : ps > ds ? ante * 4 : ps === ds ? ante * 2 : 0;
        this.pay(p, main + bonus);
        const net = main + bonus - ante * 2;
        p.result = `${net > 0 ? `Win +${net}` : net === 0 ? 'Push' : `Lose −${-net}`}${!qualifies ? ' (dealer doesn’t qualify)' : ''}${bonus ? ` incl. bonus ${bonus}` : ''}`;
      }
      this.results.push(`${p.seat.name}: ${p.result}`);
    }
    this.end();
  }

  pending(): string[] {
    if (this.phase === 'play') return this.ps.filter((p) => p.play === null).map((p) => p.seat.id);
    return this.betting();
  }

  auto(seatId: string) {
    const p = this.find(seatId);
    if (!p) return;
    if (this.phase === 'bet') {
      p.bet = 0;
      return this.afterBet();
    }
    this.act(seatId, { type: 'fold' });
  }

  view(seatId: string): GameView {
    const me = this.find(seatId);
    const open = this.phase === 'done';
    const options = this.betOptions(me);
    if (me && this.phase === 'play' && me.play === null) Object.assign(options, { fold: true, play: me.bet! });
    return {
      phase: this.phaseName('Play or fold'),
      pot: this.ps.reduce((s, p) => s + (p.bet ?? 0) * (p.play ? 2 : 1), 0),
      board: [],
      dealer: this.dealer.length ? { cards: open ? this.dealer : ['??', '??', '??'], note: open ? handName3(score3(this.dealer)) : undefined } : null,
      players: this.ps.map((p) => ({
        id: p.seat.id,
        name: p.seat.name,
        chips: p.seat.chips,
        bet: (p.bet ?? 0) * (p.play ? 2 : 1),
        status: p.result ?? (p.bet === null ? 'Betting…' : p.play === null ? 'Deciding…' : p.play ? 'Playing' : 'Folded'),
        cards: p === me || open ? p.cards : p.cards.map(() => '??'),
        turn: this.pending().includes(p.seat.id),
      })),
      mine: me?.cards.length ? [{ label: `Ante ${me.bet}${me.play ? ` · Play ${me.bet}` : ''}`, cards: me.cards, note: handName3(score3(me.cards)) }] : [],
      options,
      results: this.results,
    };
  }
}
