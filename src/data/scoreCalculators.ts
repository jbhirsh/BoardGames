/**
 * The score pads, at /score/<slug> for a game and /score/<slug>/<part> for
 * a game inside one (a deck's card games). Each pad is this data plus a
 * pure scoring module in src/utils:
 *   - 7 Wonders: a player at a time, then a sheet (utils/sevenWonders.ts).
 *   - Ticket to Ride (the US map and Europe) and Dominion (with Intrigue):
 *     the same, counting what's on the table at the end
 *     (utils/ticketToRide.ts, utils/dominion.ts).
 *   - The card games: a running score, round by round, to a target or for
 *     a set number of rounds (utils/cardGameScores.ts, with CARD_GAMES
 *     below).
 * A new pad needs its scoring and a component too
 * (components/ScoreCalculatorPage.tsx picks one by `kind`).
 */

/** The card games a round-by-round pad scores. */
export type CardGameId = 'uno' | 'rummy' | 'hearts' | 'golf' | 'spades' | 'euchre';

/** Which pad a game has. */
export type ScorePad =
  { kind: 'seven-wonders' } | { kind: 'ticket-to-ride' } | { kind: 'dominion' } | { kind: 'rounds'; game: CardGameId };

/**
 * How a card game is won: the first to reach `to` points ends it, or it
 * ends after `rounds` rounds; `low` when the lowest total wins.
 */
export type CardGameGoal = { to: number; low: boolean } | { rounds: number; low: boolean };

/** A card game's pad: who plays, how it's won, and what the page says. */
export interface CardGameRules {
  name: string;
  /**
   * Two partnerships of two, scored as teams (partners sit opposite:
   * players 1 and 3 against 2 and 4). Otherwise each player for themselves.
   */
  teams: boolean;
  minPlayers: number;
  maxPlayers: number;
  goal: CardGameGoal;
  /** What a round is called at this game: a hand, a hole. */
  round: string;
  /** The scoring the pad applies, as the page states it under the sheet. */
  rule: string;
}

/**
 * The card games, scored as their rules sheets in public/rules have them
 * (Uno's printed rules; the others The Game Room's own sheets for Card
 * Deck). Where a sheet leaves something open, `rule` says what the pad
 * does.
 */
export const CARD_GAMES: Record<CardGameId, CardGameRules> = {
  uno: {
    name: 'Uno',
    teams: false,
    minPlayers: 2,
    maxPlayers: 10,
    goal: { to: 500, low: false },
    round: 'Round',
    rule: "The player who goes out scores the cards left in everyone else's hands: number cards their face value, Draw Two, Reverse and Skip 20, Wild and Wild Draw Four 50. First to 500 wins.",
  },
  rummy: {
    name: 'Rummy',
    teams: false,
    minPlayers: 2,
    maxPlayers: 6,
    goal: { to: 100, low: false },
    round: 'Hand',
    rule: "The player who goes out scores the cards left in everyone else's hands: face cards 10, aces 1, the rest their face value. First to 100 wins. Gin Rummy scores differently and isn't on this pad.",
  },
  hearts: {
    name: 'Hearts',
    teams: false,
    minPlayers: 3,
    maxPlayers: 5,
    goal: { to: 100, low: true },
    round: 'Hand',
    rule: 'Each heart taken is 1 point and the queen of spades 13, so a hand holds 26. Shoot the moon (take them all) and you score 0 and everyone else 26. When someone reaches 100, the lowest score wins.',
  },
  golf: {
    name: 'Golf',
    teams: false,
    minPlayers: 2,
    maxPlayers: 6,
    goal: { rounds: 9, low: true },
    round: 'Hole',
    rule: "Enter each player's six cards as they score: ace 1, 2 is minus 2, number cards their face value, jacks and queens 10, kings 0, a pair in a column 0. Nine holes; the lowest total wins.",
  },
  spades: {
    name: 'Spades',
    teams: true,
    minPlayers: 4,
    maxPlayers: 4,
    goal: { to: 500, low: false },
    round: 'Hand',
    rule: "A partnership that makes its contract (both bids added) scores 10 a trick bid and 1 a trick over (a bag); short of it, it loses 10 a trick bid. Every 10 bags costs 100. A bid of 0 is nil: 100 if you take no tricks, minus 100 if you take any. A nil bidder's tricks don't count toward the partner's bid; they score nothing but count as the partnership's bags. First partnership to 500 wins.",
  },
  euchre: {
    name: 'Euchre',
    teams: true,
    minPlayers: 4,
    maxPlayers: 4,
    goal: { to: 10, low: false },
    round: 'Hand',
    rule: "The makers (the team that chose trump) score 1 for 3 or 4 tricks and 2 for all 5, or 4 if one of them went alone and took all 5. Take fewer than 3 and they're euchred: the other team scores 2. First team to 10 wins.",
  },
};

/**
 * Every pad, by its path after /score/: `<slug>` for a game in the
 * collection, `<slug>/<part>` for a game inside one, `part` being the slug
 * its rulebook tab has.
 */
const PADS: ReadonlyMap<string, ScorePad> = new Map<string, ScorePad>([
  ['7-wonders', { kind: 'seven-wonders' }],
  ['ticket-to-ride', { kind: 'ticket-to-ride' }],
  ['dominion', { kind: 'dominion' }],
  ['uno', { kind: 'rounds', game: 'uno' }],
  ['card-deck/rummy', { kind: 'rounds', game: 'rummy' }],
  ['card-deck/hearts', { kind: 'rounds', game: 'hearts' }],
  ['card-deck/golf', { kind: 'rounds', game: 'golf' }],
  ['card-deck/spades', { kind: 'rounds', game: 'spades' }],
  ['card-deck/euchre', { kind: 'rounds', game: 'euchre' }],
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

/**
 * A rulebook tab whose game's pad opens set for it: Europe's tab opens
 * Ticket to Ride's on the Europe map.
 */
const TAB_CHOICES: Readonly<Record<string, string>> = { 'ticket-to-ride/europe': '?map=europe' };

/**
 * Where a rules tab's Score link goes: the pad of the game the tab is for
 * (a deck's Hearts), else its game's pad, set for the tab where it can be
 * (TAB_CHOICES); null when there is neither.
 */
export function scorePadLink(slug: string, part?: string): string | null {
  const game = scorePadPath(slug);
  return scorePadPath(slug, part) ?? (game && `${game}${TAB_CHOICES[key(slug, part)] ?? ''}`);
}

/** Every pad's path after /score/, for the tests that check each is a real game. */
export const SCORE_PAD_KEYS: readonly string[] = [...PADS.keys()];

/**
 * Games in the collection with a pad of their own, which a card and the
 * rules page link to as Score.
 */
export const SCORE_CALCULATORS: ReadonlySet<string> = new Set(SCORE_PAD_KEYS.filter((k) => !k.includes('/')));
