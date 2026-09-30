import type { Card } from './cards.ts';

export type GameId = 'blackjack' | 'threecard' | 'draw' | 'nine' | 'holdem';

/** A seat at a table. Games change `chips` in place; the room owns the object. */
export interface Seat {
  id: string;
  name: string;
  chips: number;
}

/** What a player asks to do. The server checks every one against the game state. */
export type Action =
  | { type: 'fold' | 'check' | 'call' | 'hit' | 'stand' | 'double' | 'split' | 'play' }
  | { type: 'raise'; to: number }
  | { type: 'bet'; amount: number }
  | { type: 'draw'; discard: number[] };

/** The actions open to one player right now, with their limits. */
export interface Options {
  fold?: true;
  check?: true;
  call?: number;
  raise?: { min: number; max: number };
  bet?: { min: number; max: number };
  hit?: true;
  stand?: true;
  double?: true;
  split?: true;
  play?: number;
  draw?: true;
}

export interface PlayerView {
  id: string;
  name: string;
  chips: number;
  bet: number;
  status: string;
  /** Face-down cards are '??'. Hidden cards never leave the server. */
  cards: Card[];
  turn: boolean;
  button?: boolean;
}

/** A group of the viewer's own cards: one hand, or one of two split Blackjack hands. */
export interface CardGroup {
  label: string;
  cards: Card[];
  note?: string;
  active?: boolean;
}

/** Everything one seat is allowed to see. */
export interface GameView {
  phase: string;
  pot: number;
  board: Card[];
  dealer: { cards: Card[]; note?: string } | null;
  players: PlayerView[];
  mine: CardGroup[];
  options: Options;
  results: string[];
}

export interface Game {
  readonly id: GameId;
  readonly maxPlayers: number;
  readonly minPlayers: number;
  /** The fewest chips needed to be dealt in. */
  readonly minChips: number;
  inHand: boolean;
  start(seats: Seat[]): void;
  /** Returns an error message, or null when the action was applied. */
  act(seatId: string, action: Action): string | null;
  /** Seats the table is waiting on. */
  pending(): string[];
  /** The timeout move: check or fold, stand, stand pat or sit out. */
  auto(seatId: string): void;
  view(seatId: string): GameView;
}
