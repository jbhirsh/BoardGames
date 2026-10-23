/**
 * The score pads, at /score/<slug> for a game. Each pad is this data plus a
 * pure scoring module in src/utils:
 *   - 7 Wonders: a player at a time, then a sheet (utils/sevenWonders.ts).
 *   - Ticket to Ride (the US map and Europe) and Dominion (with Intrigue):
 *     the same, counting what's on the table at the end
 *     (utils/ticketToRide.ts, utils/dominion.ts).
 * A new pad needs its scoring and a component too
 * (components/ScoreCalculatorPage.tsx picks one by `kind`).
 */

/** Which pad a game has. */
export type ScorePad =
  | { kind: 'seven-wonders' }
  | { kind: 'ticket-to-ride' }
  | { kind: 'dominion' };

/** Every pad, by its path after /score/. */
const PADS: ReadonlyMap<string, ScorePad> = new Map<string, ScorePad>([
  ['7-wonders', { kind: 'seven-wonders' }],
  ['ticket-to-ride', { kind: 'ticket-to-ride' }],
  ['dominion', { kind: 'dominion' }],
]);

const key = (slug: string, part?: string) => (part ? `${slug}/${part}` : slug);

/** The pad for a game, or for a game inside one (`part`), if it has one. */
export function scorePadFor(slug: string, part?: string): ScorePad | undefined {
  return PADS.get(key(slug, part));
}

/** Where a game's pad is, or a game inside one's; null when it has none. */
export function scorePadPath(slug: string, part?: string): string | null {
  return PADS.has(key(slug, part)) ? `/score/${key(slug, part)}` : null;
}

/** Every pad's path after /score/, for the tests that check each is a real game. */
export const SCORE_PAD_KEYS: readonly string[] = [...PADS.keys()];

/**
 * Games in the collection with a pad of their own, which a card and the
 * rules page link to as Score.
 */
export const SCORE_CALCULATORS: ReadonlySet<string> = new Set(SCORE_PAD_KEYS.filter((k) => !k.includes('/')));
