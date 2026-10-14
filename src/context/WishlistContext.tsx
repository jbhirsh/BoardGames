import { useContext, useMemo, type ReactNode } from 'react';
import { WISHLIST } from '../data/wishlist';
import { useSuggestions } from '../hooks/useSuggestions';
import { mergeWishlist } from '../utils/mergeWishlist';
import { filterWishlist } from '../utils/filterGames';
import { WishlistContext } from './wishlistContextValue';
import { FilteredWishlistContext, FilterResultsContext } from './filterContextValue';

/**
 * One definition of "the wishlist" for the whole page: the static entries
 * plus approved friend suggestions, loaded once. The wishlist section renders
 * it, the keyword counts tally it and the hero counts it. A suggestion for a
 * game the compiled list already has is held back as `hidden`, so it shows
 * up once and the owner can still clear the stored record. It also works out
 * once what the filters leave of it, for the section, the filter sheet's
 * count, the empty state and the hero's covers.
 */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { items: suggested, loaded, reload } = useSuggestions();
  const merged = useMemo(() => mergeWishlist(WISHLIST, suggested), [suggested]);
  const value = useMemo(() => ({ ...merged, loaded, reload }), [merged, loaded, reload]);
  const state = useContext(FilterResultsContext)?.state;
  const filtered = useMemo(() => (state ? filterWishlist(merged.items, state) : null), [merged.items, state]);
  return (
    <WishlistContext.Provider value={value}>
      <FilteredWishlistContext.Provider value={filtered}>{children}</FilteredWishlistContext.Provider>
    </WishlistContext.Provider>
  );
}
