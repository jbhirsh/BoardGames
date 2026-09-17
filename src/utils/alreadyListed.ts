import { GAMES } from '../data/games';
import { WISHLIST } from '../data/wishlist';
import { normalizeName } from './normalizeName';

/**
 * Why a game doesn't need adding: we own it, or the wishlist already has it.
 * Names match the loose way `mergeWishlist` decides a stored suggestion
 * duplicates a compiled entry, so the forms refuse exactly the games that
 * would otherwise be stored and then hidden.
 */
export function alreadyListed(game: string): string | null {
  const key = normalizeName(game);
  if (!key) return null;
  const owned = GAMES.find((g) => normalizeName(g.name) === key);
  if (owned) return `We already own ${owned.name}.`;
  const wanted = WISHLIST.find((w) => normalizeName(w.name) === key);
  if (wanted) return `${wanted.name} is already on the wishlist.`;
  return null;
}
