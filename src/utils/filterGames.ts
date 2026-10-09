import type { Game, FilterState, Filterable, SubGame, TimeBudget, WishlistItem } from '../data/types';
import { GROUP_ORDER, KW, TIME_BUDGETS, WISHLIST_TYPE_ORDER } from '../data/keywords';

/**
 * Apply the filter bar to any Filterable list. `groupIndex` orders items for
 * the "group" sort; each list decides what its groups are.
 */
export function filterItems<T extends Filterable>(
  items: T[],
  state: FilterState,
  groupIndex: (item: T) => number,
): T[] {
  // Players and time are checked together per game: a card deck stays when
  // one of its games fits both, not when one fits the players and another
  // the time. A deck is never played on its own, so its own players and time
  // (a summary of its games) never keep it; a base game with add-ons is.
  let list = items.filter(g => (!isDeck(g.subgames) && fitsTable(g, state))
    || (g.subgames ?? []).some(s => fitsTable(s, state)));

  if (state.keywords.size > 0) {
    const match = state.keywordMode === 'and' ? 'every' : 'some';
    list = list.filter(g => [...state.keywords][match](k => g.kw.includes(k)));
  }

  if (state.search) {
    const q = state.search.toLowerCase().trim();
    list = list.filter(g => g.name.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q)
      || (g.subgames ?? []).some(s => s.name.toLowerCase().includes(q)));
  }

  return sortItems(list, state.sort, groupIndex);
}

type Table = Pick<Filterable, 'min' | 'max' | 'mins'>;

/** True when every game inside is played with the parent's deck. */
export function isDeck(subs: SubGame[] = []): boolean {
  return subs.length > 0 && subs.every((s) => s.kind === 'card-game');
}

/** Whether the players and time filters are narrowing anything. */
export function tableFiltered(state: FilterState): boolean {
  return state.players > 0 || state.duration !== 'all';
}

/**
 * Whether a game (or a game inside one) fits the players and time filters.
 * The duration filter is a time budget: "we have an hour" keeps every game
 * that takes an hour or less, quick ones included, judged by its own minutes
 * (the long end of its range). An item with no known play time (mins 0, e.g.
 * a suggestion BGG didn't resolve) can't be excluded by duration, so it stays
 * under every budget.
 */
export function fitsTable(g: Table, state: FilterState): boolean {
  if (state.duration !== 'all' && g.mins > state.duration) return false;
  return state.players === 0 || (g.min <= state.players && g.max >= state.players);
}

/**
 * The smallest budget a play time fits, which a game's time pill filters to;
 * none for a game longer than every budget or with no known time.
 */
export function budgetFor(mins: number): TimeBudget | undefined {
  return mins > 0 ? TIME_BUDGETS.find((b) => mins <= b) : undefined;
}

export function filterGames(games: Game[], state: FilterState): Game[] {
  return filterItems(games, state, (g) => GROUP_ORDER.indexOf(g.group));
}

export function filterWishlist(items: WishlistItem[], state: FilterState): WishlistItem[] {
  return filterItems(items, state, (w) => WISHLIST_TYPE_ORDER.indexOf(w.type));
}

const CAT_ORDER = { quick: 0, medium: 1, long: 2 } as const;
// mins 0 means the play time is unknown (the filter matches it everywhere);
// sorting by time puts it last in both directions rather than first as 0 min.
const mins = (g: Filterable) => g.mins || Number.MAX_SAFE_INTEGER;
// A deck has no weight of its own: by the end of its games' span the sort
// looks for, its lightest game lightest first and its heaviest heaviest first.
const weightOf = (g: Filterable, dir: 1 | -1) => {
  if (g.weight !== undefined) return g.weight;
  const known = (g.subgames ?? []).flatMap((s) => (s.weight === undefined ? [] : [s.weight]));
  if (known.length === 0) return Infinity;
  return dir === 1 ? Math.min(...known) : Math.max(...known);
};
/** By weight, `dir` 1 lightest first, -1 heaviest first; unknown weights last either way. */
const byWeight = (dir: 1 | -1) => (a: Filterable, b: Filterable) => {
  const wa = weightOf(a, dir), wb = weightOf(b, dir);
  if (wa === wb) return a.name.localeCompare(b.name);
  if (wa === Infinity) return 1;
  if (wb === Infinity) return -1;
  return (wa - wb) * dir;
};

export function sortItems<T extends Filterable>(list: T[], sort: string, groupIndex: (item: T) => number): T[] {
  // 'votes' starts from A→Z: the wishlist puts the most voted first from
  // there, since the counts live outside the filter.
  if (sort === 'az' || sort === 'name-asc' || sort === 'votes')  return [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'name-desc') return [...list].sort((a, b) => b.name.localeCompare(a.name));
  if (sort === 'quick' || sort === 'dur-asc') return [...list].sort((a, b) => mins(a) - mins(b) || CAT_ORDER[a.cat] - CAT_ORDER[b.cat]);
  if (sort === 'long'  || sort === 'dur-desc') return [...list].sort((a, b) => b.mins - a.mins || CAT_ORDER[b.cat] - CAT_ORDER[a.cat]);
  if (sort === 'players-asc')  return [...list].sort((a, b) => a.min - b.min || a.max - b.max);
  if (sort === 'players-desc') return [...list].sort((a, b) => b.min - a.min || b.max - a.max);
  if (sort === 'weight-asc') return [...list].sort(byWeight(1));
  if (sort === 'weight-desc') return [...list].sort(byWeight(-1));
  // group
  return [...list].sort((a, b) => {
    const gi = groupIndex(a) - groupIndex(b);
    return gi !== 0 ? gi : a.name.localeCompare(b.name);
  });
}

export function sortGames(list: Game[], sort: string): Game[] {
  return sortItems(list, sort, (g) => GROUP_ORDER.indexOf(g.group));
}

/** The group sort is active whether chosen directly or as the base under a column sort. */
export function isGrouped(state: FilterState): boolean {
  return state.sort === 'group' || state.baseSort === 'group';
}

export function sortedKw(kw: string[]): string[] {
  return [...kw].sort((a, b) => (KW[a as keyof typeof KW] || a).localeCompare(KW[b as keyof typeof KW] || b));
}
