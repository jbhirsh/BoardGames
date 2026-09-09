import { useMemo, type ReactNode } from 'react';
import { WISHLIST } from '../data/wishlist';
import { useSuggestions } from '../hooks/useSuggestions';
import { WishlistContext } from './wishlistContextValue';

/**
 * One definition of "the wishlist" for the whole page: the static entries
 * plus approved friend suggestions, loaded once. The wishlist section renders
 * it, the keyword counts tally it and the hero counts it.
 */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { items: suggested, loaded, reload } = useSuggestions();
  const value = useMemo(() => ({ items: [...WISHLIST, ...suggested], loaded, reload }), [suggested, loaded, reload]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}
