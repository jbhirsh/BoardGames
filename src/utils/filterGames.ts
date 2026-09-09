import type { Game, FilterState, Filterable, WishlistItem } from '../data/types';
import { GROUP_ORDER, KW, WISHLIST_TYPE_ORDER } from '../data/keywords';

/**
 * Apply the filter bar to any Filterable list. `groupIndex` orders items for
 * the "group" sort; each list decides what its groups are.
 */
export function filterItems<T extends Filterable>(
  items: T[],
  state: FilterState,
  groupIndex: (item: T) => number,
): T[] {
  let list = items;

  // Filter on the curated `cat` field, not a re-derivation from `mins`. The
  // clickable DurationPill and SET_DURATION both use `cat`, so filtering by
  // anything else lets the two disagree — e.g. a 90-minute game tagged
  // "medium" would vanish when you click its own "medium" pill.
  // An item with no known play time (mins 0, e.g. a suggestion BGG didn't
  // resolve) can't be excluded by duration, so it stays under every bucket.
  if (state.duration !== 'all') list = list.filter(g => g.mins === 0 || g.cat === state.duration);

  if (state.players > 0) list = list.filter(g => g.min <= state.players && g.max >= state.players);

  if (state.keywords.size > 0) {
    const match = state.keywordMode === 'and' ? 'every' : 'some';
    list = list.filter(g => [...state.keywords][match](k => g.kw.includes(k)));
  }

  if (state.search) {
    const q = state.search.toLowerCase().trim();
    list = list.filter(g => g.name.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q));
  }

  return sortItems(list, state.sort, groupIndex);
}

export function filterGames(games: Game[], state: FilterState): Game[] {
  return filterItems(games, state, (g) => GROUP_ORDER.indexOf(g.group));
}

export function filterWishlist(items: WishlistItem[], state: FilterState): WishlistItem[] {
  return filterItems(items, state, (w) => WISHLIST_TYPE_ORDER.indexOf(w.type));
}

const CAT_ORDER = { quick: 0, medium: 1, long: 2 } as const;

export function sortItems<T extends Filterable>(list: T[], sort: string, groupIndex: (item: T) => number): T[] {
  if (sort === 'az' || sort === 'name-asc')  return [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'name-desc') return [...list].sort((a, b) => b.name.localeCompare(a.name));
  if (sort === 'quick' || sort === 'dur-asc') return [...list].sort((a, b) => a.mins - b.mins || CAT_ORDER[a.cat] - CAT_ORDER[b.cat]);
  if (sort === 'long'  || sort === 'dur-desc') return [...list].sort((a, b) => b.mins - a.mins || CAT_ORDER[b.cat] - CAT_ORDER[a.cat]);
  if (sort === 'players-asc')  return [...list].sort((a, b) => a.min - b.min || a.max - b.max);
  if (sort === 'players-desc') return [...list].sort((a, b) => b.min - a.min || b.max - a.max);
  // group
  return [...list].sort((a, b) => {
    const gi = groupIndex(a) - groupIndex(b);
    return gi !== 0 ? gi : a.name.localeCompare(b.name);
  });
}

export function sortGames(list: Game[], sort: string): Game[] {
  return sortItems(list, sort, (g) => GROUP_ORDER.indexOf(g.group));
}

export function sortedKw(kw: string[]): string[] {
  return [...kw].sort((a, b) => (KW[a as keyof typeof KW] || a).localeCompare(KW[b as keyof typeof KW] || b));
}
