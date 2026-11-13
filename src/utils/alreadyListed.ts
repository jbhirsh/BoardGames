import { ALL_GAMES } from '../data/games';
import type { WishlistItem } from '../data/types';
import { normalizeName } from './normalizeName';

/**
 * Why a game doesn't need adding: we own it, or the wishlist (`wishlist`,
 * as the page loaded it) already has it. Names match the loose way the API
 * checks for a duplicate, so the forms refuse what it would refuse.
 */
export function alreadyListed(game: string, wishlist: readonly WishlistItem[]): string | null {
  const key = normalizeName(game);
  if (!key) return null;
  const owned = ALL_GAMES.find((g) => normalizeName(g.name) === key);
  if (owned) return `We already own ${owned.name}.`;
  const wanted = wishlist.find((w) => normalizeName(w.name) === key);
  if (wanted) return `${wanted.name} is already on the wishlist.`;
  return null;
}
