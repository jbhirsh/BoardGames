// Which wishlist section a game goes under (#290's part 2b), worked out from
// what BoardGameGeek says about it rather than asked of the owner. The rule,
// first match wins:
//
//   1. at most 2 players                         → Two-Player
//   2. BGG's "Party Game" category, or 8+ players → Party & Card
//   3. weight 3.25 or more                       → Heavy Strategy
//   4. BGG's "Cooperative Game" mechanic         → Cooperative
//   5. otherwise                                 → Strategy
//
// Run against the 39 entries the owner sorted by hand, it files 37 as she
// did (3.4 filed 36: Terraforming Mars, at 3.27, fell out of Heavy). The two
// it misses (Don't Nod Unless, The Mind) no threshold fixes; the owner moves
// a miss with Edit. Pure: tests drive it directly.

import type { WishlistSection } from './limits.js';

/** The weight from which a game is Heavy Strategy. */
export const HEAVY_FROM = 3.25;

/** What the rule reads: BGG's most players, weight, and its categories and mechanics as BGG names them. */
export interface SectionInput {
  max: number;
  weight?: number;
  categories: readonly string[];
  mechanics: readonly string[];
}

export function inferSection({ max, weight, categories, mechanics }: SectionInput): WishlistSection {
  if (max <= 2) return 'two-player';
  if (categories.includes('Party Game') || max >= 8) return 'party';
  if (weight !== undefined && weight >= HEAVY_FROM) return 'heavy';
  if (mechanics.includes('Cooperative Game')) return 'coop';
  return 'strategy';
}
