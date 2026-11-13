import { createContext } from 'react';
import type { Game, WishlistItem } from '../data/types';
import { COMING_SOON, GAMES } from '../data/games';
import type { BggIndex } from '../utils/bggInfo';

/** The games query's answer as the page uses it (GamesProvider). */
export interface GamesData {
  /** Every game on the wishlist; empty until the query answers. */
  wishlist: WishlistItem[];
  /** What BoardGameGeek says about every game the site knows, by BGG id. */
  bgg: BggIndex;
  /** The collection on the shelf, and Coming Soon, with BGG's difficulty, awards and the owner's picked summaries. */
  collection: Game[];
  comingSoon: Game[];
  /** False until the query has settled (a failure settles it too). */
  loaded: boolean;
  /** True when it settled with no answer at all: the first ask failed, and no saved answer stood in. */
  failed: boolean;
  /** Ask again, after the owner changes the wishlist. */
  reload: () => void;
}

/**
 * Outside the provider (a component's own test, a page without it), the
 * compiled collection as it is, an empty wishlist, already loaded.
 */
export const GamesContext = createContext<GamesData>({
  wishlist: [],
  bgg: new Map(),
  collection: GAMES,
  comingSoon: COMING_SOON,
  loaded: true,
  failed: false,
  reload: () => {},
});
