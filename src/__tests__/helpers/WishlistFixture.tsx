import type { ReactNode } from 'react';
import { WishlistContext } from '../../context/wishlistContextValue';
import { WISHLIST } from './wishlist';

/** The seed's wishlist, loaded, for a component rendered without the games query. */
export function WishlistFixture({ children }: { children: ReactNode }) {
  return (
    <WishlistContext.Provider value={{ items: WISHLIST, loaded: true, failed: false, reload: () => {} }}>
      {children}
    </WishlistContext.Provider>
  );
}
