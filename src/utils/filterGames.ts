import type {
  BaseSort,
  ColumnSort,
  Game,
  FilterState,
  Filterable,
  GroupId,
  SortMode,
  SubGame,
  TimeBudget,
  WishlistItem,
  WishlistType,
} from '../data/types';
import { GROUP_ORDER, KW, TIME_BUDGETS, WISHLIST_TYPE_ORDER } from '../data/keywords';
import { anyFilterOn } from './filterState';

// The filter pipeline, generic over Filterable so one pipeline serves the
// collection and the wishlist: filterItems, with filterGames and
// filterWishlist deciding their own grouping, then groupItems to split the
// result under its headings. The players and time filters keep a game when
// it fits on its own or one of the games inside it fits both (a deck only
// by its games, since it is never played on its own), and search matches
// their names too.

/**
 * Apply the filter bar to any Filterable list. `groupIndex` orders items for
 * the "group" sort; each list decides what its groups are.
 */
function filterItems<T extends Filterable>(items: T[], state: FilterState, groupIndex: (item: T) => number): T[] {
  // Players and time are checked together per game: a card deck stays when
  // one of its games fits both, not when one fits the players and another
  // the time. A deck is never played on its own, so its own players and time
  // (a summary of its games) never keep it; a base game with add-ons is.
  let list = items.filter(
    (g) => (!isDeck(g.subgames) && fitsTable(g, state)) || (g.subgames ?? []).some((s) => fitsTable(s, state)),
  );

  if (state.keywords.size > 0) {
    const match = state.keywordMode === 'and' ? 'every' : 'some';
    list = list.filter((g) => [...state.keywords][match]((k) => g.kw.includes(k)));
  }

  if (state.search) {
    const q = state.search.toLowerCase().trim();
    // A friend's suggestion is also found by who suggested it.
    list = list.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.desc.toLowerCase().includes(q) ||
        ('suggestedBy' in g && typeof g.suggestedBy === 'string' && g.suggestedBy.toLowerCase().includes(q)) ||
        (g.subgames ?? []).some((s) => s.name.toLowerCase().includes(q)),
    );
  }

  return sortItems(list, state.sort, groupIndex);
}

type Table = Pick<Filterable, 'min' | 'max' | 'mins'>;

/** True when every game inside is played with the parent's deck. */
export function isDeck(subs: SubGame[] = []): boolean {
  return subs.length > 0 && subs.every((s) => s.kind === 'card-game');
}

/**
 * The players and time filters, the ones a game inside another is held to:
 * all a card or row needs of the state to say which of its games fit.
 */
export type TableFilter = Pick<FilterState, 'players' | 'duration'>;

/** Whether the players and time filters are narrowing anything. */
export function tableFiltered(state: TableFilter): boolean {
  return anyFilterOn(state, ['players', 'duration']);
}

/**
 * Whether a game (or a game inside one) fits the players and time filters.
 * The duration filter is a time budget: "we have an hour" keeps every game
 * that takes an hour or less, quick ones included, judged by its own minutes
 * (the long end of its range). An item with no known play time (mins 0, e.g.
 * a suggestion BGG didn't resolve) can't be excluded by duration, so it stays
 * under every budget.
 */
export function fitsTable(g: Table, state: TableFilter): boolean {
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

/** One heading's worth of a list; `key` is null for the flat, ungrouped list. */
export interface ItemGroup<T, K extends string> {
  key: K | null;
  items: T[];
}

export type GameGroup = ItemGroup<Game, GroupId>;
export type WishlistGroup = ItemGroup<WishlistItem, WishlistType>;

/**
 * Splits a list into its groups in `order`, each keeping the list's own
 * order (so a column sort on top of the group sort orders within each
 * group), and leaves out the groups with nothing in them. The views render
 * the groups they are handed and never group a list themselves: the
 * collection's come from groupGames, served ready-made as `gameGroups` by
 * the filter context; the wishlist (Wishlist.tsx) groups by type. Both
 * tables draw them with GroupedRows.
 */
export function groupItems<T, K extends string>(
  list: T[],
  order: readonly K[],
  keyOf: (item: T) => K,
): ItemGroup<T, K>[] {
  return order
    .map((key) => ({ key, items: list.filter((item) => keyOf(item) === key) }))
    .filter((g) => g.items.length > 0);
}

/**
 * The filtered collection as both its views show it: under the group sort
 * (chosen, or the base under a column sort) a group per kind of game, in
 * the groups' order; under any other sort one flat list.
 */
export function groupGames(games: Game[], state: FilterState): GameGroup[] {
  return isGrouped(state) ? groupItems(games, GROUP_ORDER, (g) => g.group) : [{ key: null, items: games }];
}

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
  const wa = weightOf(a, dir),
    wb = weightOf(b, dir);
  if (wa === wb) return a.name.localeCompare(b.name);
  if (wa === Infinity) return 1;
  if (wb === Infinity) return -1;
  return (wa - wb) * dir;
};

/** Whether a sort is a column header's rather than one the filter bar offers. */
export function isColumnSort(sort: SortMode): sort is ColumnSort {
  return sort.endsWith('-asc') || sort.endsWith('-desc');
}

// The filter bar's orders other than by group are the Name and Duration
// columns' under their own names (so a column's arrow shows only for a
// column sort). 'votes' starts from A→Z: the wishlist puts the most voted
// first from there, since the counts live outside the filter.
const AS_COLUMN: Record<Exclude<BaseSort, 'group'>, ColumnSort> = {
  az: 'name-asc',
  votes: 'name-asc',
  quick: 'dur-asc',
  long: 'dur-desc',
};

export function sortItems<T extends Filterable>(list: T[], sort: SortMode, groupIndex: (item: T) => number): T[] {
  const order = sort === 'group' || isColumnSort(sort) ? sort : AS_COLUMN[sort];
  if (order === 'name-asc') return [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (order === 'name-desc') return [...list].sort((a, b) => b.name.localeCompare(a.name));
  if (order === 'dur-asc') return [...list].sort((a, b) => mins(a) - mins(b));
  if (order === 'dur-desc') return [...list].sort((a, b) => b.mins - a.mins);
  if (order === 'players-asc') return [...list].sort((a, b) => a.min - b.min || a.max - b.max);
  if (order === 'players-desc') return [...list].sort((a, b) => b.min - a.min || b.max - a.max);
  if (order === 'weight-asc') return [...list].sort(byWeight(1));
  if (order === 'weight-desc') return [...list].sort(byWeight(-1));
  // group
  return [...list].sort((a, b) => {
    const gi = groupIndex(a) - groupIndex(b);
    return gi !== 0 ? gi : a.name.localeCompare(b.name);
  });
}

/** The group sort is active whether chosen directly or as the base under a column sort. */
export function isGrouped(state: FilterState): boolean {
  return state.sort === 'group' || state.baseSort === 'group';
}

// A keyword's label; a key KW doesn't know sorts by itself.
const kwLabel = (k: string): string => (KW as Partial<Record<string, string>>)[k] ?? k;

/** Keywords in the order of their labels, keeping their own type. */
export function sortedKw<K extends string>(kw: readonly K[]): K[] {
  return [...kw].sort((a, b) => kwLabel(a).localeCompare(kwLabel(b)));
}
