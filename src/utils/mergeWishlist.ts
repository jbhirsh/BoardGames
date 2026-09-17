import type { WishlistItem } from '../data/types';
import { normalizeName } from './normalizeName';

export interface MergedWishlist {
  /** What the page shows: compiled entries, then the suggestions they don't cover. */
  items: WishlistItem[];
  /**
   * Stored suggestions left out because the list already has that game. They
   * are still in Redis, so the owner needs a way to see and remove them.
   */
  hidden: WishlistItem[];
}

/**
 * The wishlist as one list.
 *
 * A game can arrive twice — a friend suggests it, the owner approves it, and
 * it later earns a hand-written entry in wishlist.ts while the stored record
 * lives on in Redis. The compiled entry wins, since it carries the box art,
 * players, duration, keywords and house blurb that a suggestion may lack.
 * Names match the same loose way the suggest form checks for duplicates, so
 * near-misses ("Pandemic Legacy" against "Pandemic Legacy: Season 1") still
 * render twice; only the owner can tell those apart anyway.
 */
export function mergeWishlist(compiled: WishlistItem[], suggested: WishlistItem[]): MergedWishlist {
  const seen = new Set<string>();
  const items: WishlistItem[] = [];
  const hidden: WishlistItem[] = [];
  for (const item of compiled) {
    // Two compiled entries never share a key (wishlistData.test.ts holds the
    // names apart), so this pass only seeds them.
    seen.add(normalizeName(item.name));
    items.push(item);
  }
  for (const item of suggested) {
    const key = normalizeName(item.name);
    // A name that normalises to nothing can't be matched on, so it stays.
    if (key && seen.has(key)) {
      hidden.push(item);
      continue;
    }
    if (key) seen.add(key);
    items.push(item);
  }
  return { items, hidden };
}
