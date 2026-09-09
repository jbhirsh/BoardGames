import { useContext } from 'react';
import { WishlistContext, type WishlistData } from './wishlistContextValue';

export function useWishlistItems(): WishlistData {
  return useContext(WishlistContext);
}
