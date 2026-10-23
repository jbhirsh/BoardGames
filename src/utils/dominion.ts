// Dominion's final count, for the score pad (components/DominionPad.tsx),
// from the second-edition rulebooks in public/rules: the base game
// (dominion.pdf) and Intrigue (dominion.intrigue.pdf).

/** The cards every game has that score: the basic Victory cards, and Curses. */
export const BASE_CARDS = [
  { key: 'estates', name: 'Estates', vp: 1 },
  { key: 'duchies', name: 'Duchies', vp: 3 },
  { key: 'provinces', name: 'Provinces', vp: 6 },
  { key: 'curses', name: 'Curses', vp: -1 },
] as const;

/**
 * The Kingdom cards that score, which count only in a game that has them
 * in its Supply: Gardens from the base game, the rest from Intrigue (whose
 * Harem is printed as Farm since 2023).
 */
export const KINGDOM_CARDS = [
  { key: 'gardens', name: 'Gardens', worth: '1 VP per 10 cards in your deck' },
  { key: 'duke', name: 'Duke', worth: '1 VP per Duchy' },
  { key: 'harem', name: 'Harem (Farm)', worth: '2 VP' },
  { key: 'mill', name: 'Mill', worth: '1 VP' },
  { key: 'nobles', name: 'Nobles', worth: '2 VP' },
] as const;

export type BaseCard = typeof BASE_CARDS[number]['key'];
export type KingdomCard = typeof KINGDOM_CARDS[number]['key'];

/** How many of each card a player has at the end, and (for Gardens) how many cards in all. */
export type DominionTally = Record<BaseCard | KingdomCard, number> & { deck: number };

export type DominionBreakdown = Record<BaseCard | KingdomCard, number> & { total: number };

/** A player's points by card, the Kingdom cards not in `kingdom` counting nothing. */
export function dominionBreakdown(t: DominionTally, kingdom: ReadonlySet<KingdomCard>): DominionBreakdown {
  const has = (card: KingdomCard) => kingdom.has(card);
  // 0 + keeps a Curse-free count at 0, where -1 times 0 is -0.
  const base = Object.fromEntries(BASE_CARDS.map(c => [c.key, 0 + t[c.key] * c.vp])) as Record<BaseCard, number>;
  const rows = {
    ...base,
    gardens: has('gardens') ? t.gardens * Math.floor(t.deck / 10) : 0,
    duke: has('duke') ? t.duke * t.duchies : 0,
    harem: has('harem') ? t.harem * 2 : 0,
    mill: has('mill') ? t.mill * 1 : 0,
    nobles: has('nobles') ? t.nobles * 2 : 0,
  };
  return { ...rows, total: Object.values(rows).reduce((sum, vp) => sum + vp, 0) };
}
