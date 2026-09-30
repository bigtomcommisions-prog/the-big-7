import { Blackjack, ThreeCard } from './house.ts';
import { Poker } from './poker.ts';
import type { Game, GameId } from './types.ts';

export * from './cards.ts';
export * from './types.ts';
export { Blackjack, ThreeCard, Poker };

export const GAME_IDS = ['blackjack', 'threecard', 'draw', 'nine', 'holdem'] as const satisfies readonly GameId[];

export function createGame(id: GameId): Game {
  return id === 'blackjack' ? new Blackjack() : id === 'threecard' ? new ThreeCard() : new Poker(id);
}
