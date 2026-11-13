import { useContext, useMemo, type ReactNode } from 'react';
import { filterWishlist } from '../utils/filterGames';
import { WishlistContext } from './wishlistContextValue';
import { FilteredWishlistContext, FilterResultsContext } from './filterContextValue';
import { useGames } from './useGames';

/**
 * One definition of "the wishlist" for the whole page: the games query's
 * (GamesProvider). The wishlist section renders it, the keyword counts
 * tally it and the hero counts it. It also works out once what the filters
 * leave of it, for the section, the filter sheet's count, the empty state
 * and the hero's covers.
 */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { wishlist: items, loaded, failed, reload } = useGames();
  const value = useMemo(() => ({ items, loaded, failed, reload }), [items, loaded, failed, reload]);
  const state = useContext(FilterResultsContext)?.state;
  const filtered = useMemo(() => (state ? filterWishlist(items, state) : null), [items, state]);
  return (
    <WishlistContext.Provider value={value}>
      <FilteredWishlistContext.Provider value={filtered}>{children}</FilteredWishlistContext.Provider>
    </WishlistContext.Provider>
  );
}
