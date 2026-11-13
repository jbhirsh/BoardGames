import { createContext } from 'react';
import type { WishlistItem } from '../data/types';

/** The wishlist as the page sees it: every game on it, from the games query. */
export interface WishlistData {
  items: WishlistItem[];
  /** False until the games query has settled (a failure settles it too). */
  loaded: boolean;
  /** True when the games query settled without an answer, so there is no wishlist to show. */
  failed: boolean;
  /** Ask again after the owner changes the wishlist. */
  reload: () => void;
}

/** Outside the provider (a component's own test), empty and loaded. */
export const WishlistContext = createContext<WishlistData>({
  items: [],
  loaded: true,
  failed: false,
  reload: () => {},
});
