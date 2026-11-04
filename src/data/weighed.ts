import { GAME_WEIGHTS } from './gameWeights';

/**
 * BoardGameGeek's weight for a game, a game inside one or a wishlist entry,
 * where BGG rates it (gameWeights.ts, `npm run game-weights`): a difficulty
 * is never typed in. Something BGG doesn't rate (no id, or null in the map)
 * shows none; a deck has none of its own, and an add-on, learned on top of
 * its game, has no id. The data tests (gamesData.test.ts,
 * wishlistData.test.ts) fail on an id the script hasn't fetched and on any
 * weight but the fetched one.
 */
export function weighed<T extends { bgg?: number; weight?: number }>(t: T): T {
  const weight = t.bgg === undefined ? undefined : GAME_WEIGHTS[t.bgg];
  return weight == null ? t : { ...t, weight };
}
