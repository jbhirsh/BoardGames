import { useMemo, type ReactNode } from 'react';
import { WISHLIST } from '../data/wishlist';
import { useSuggestions } from '../hooks/useSuggestions';
import { mergeWishlist } from '../utils/mergeWishlist';
import { WishlistContext } from './wishlistContextValue';

/**
 * One definition of "the wishlist" for the whole page: the static entries
 * plus approved friend suggestions, loaded once. The wishlist section renders
 * it, the keyword counts tally it and the hero counts it. A suggestion for a
 * game the compiled list already has is held back as `hidden`, so it shows
 * up once and the owner can still clear the stored record.
 */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { items: suggested, loaded, reload } = useSuggestions();
  const value = useMemo(() => ({ ...mergeWishlist(WISHLIST, suggested), loaded, reload }), [suggested, loaded, reload]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}
