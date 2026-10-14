import { useContext, useMemo } from 'react';
import type { WishlistItem } from '../data/types';
import { filterWishlist } from '../utils/filterGames';
import { FilteredWishlistContext } from './filterContextValue';
import { useFilterResults } from './useFilter';
import { useWishlistItems } from './useWishlistItems';

/**
 * The wishlist the filters leave: WishlistProvider's, worked out once for
 * the page, or (outside it, as in a component's own test) from the static
 * list.
 */
export function useFilteredWishlist(): WishlistItem[] {
  const provided = useContext(FilteredWishlistContext);
  const { state } = useFilterResults();
  const { items } = useWishlistItems();
  return useMemo(() => provided ?? filterWishlist(items, state), [provided, items, state]);
}
