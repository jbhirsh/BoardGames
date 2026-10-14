import { expect } from 'vitest';

/**
 * The filter fields every table carries, for the data tests. A game, a game
 * inside one and a wishlist entry each state players and time twice, once
 * as text for the card (`players`, `dur`) and once as numbers for the
 * filters (`min`, `max`, `mins`), and nothing else notices when the
 * two drift: the card says one thing while the players or time filter does
 * another.
 */
interface Table {
  players: string;
  min: number;
  max: number;
  dur: string;
  mins: number;
}

export const numbers = (s: string) => (s.match(/\d+/g) ?? []).map(Number);

/** The checks every table shares. */
export function expectCoherentTable(t: Table, label: string) {
  expect(t.min, `${label}: min`).toBeGreaterThan(0);
  expect(t.max, `${label}: max`).toBeGreaterThanOrEqual(t.min);
  expect(t.mins, `${label}: mins`).toBeGreaterThan(0);

  // The card's time ends at `mins`, the number the sorts and filters use.
  expect(t.dur, `${label}: dur`).toMatch(/^\d+(–\d+)? (min|hrs?)$/);
  const top = numbers(t.dur).at(-1)!;
  expect(t.dur.endsWith('min') ? top : top * 60, `${label}: dur vs mins`).toBe(t.mins);

  // The card's players start at `min`; an open-ended count ("2+") is max 99.
  expect(t.players, `${label}: players`).toMatch(/^\d+(–\d+)?\+?$/);
  expect(numbers(t.players)[0], `${label}: players vs min`).toBe(t.min);
  expect(t.players.endsWith('+'), `${label}: open-ended players vs max`).toBe(t.max >= 99);
}
