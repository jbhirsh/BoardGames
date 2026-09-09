import { createContext } from 'react';
import type { WishlistItem } from '../data/types';
import { WISHLIST } from '../data/wishlist';

/** The wishlist as the page sees it: the static entries plus approved friend suggestions. */
export interface WishlistData {
  items: WishlistItem[];
  /** False until the suggestions request has settled (a failure settles it too). */
  loaded: boolean;
  /** Re-fetch the suggestions after the owner changes them. */
  reload: () => void;
}

/**
 * Defaults to the static list, already loaded, so components render sensibly
 * outside the provider (unit tests, pages without the wishlist).
 */
export const WishlistContext = createContext<WishlistData>({ items: WISHLIST, loaded: true, reload: () => {} });
