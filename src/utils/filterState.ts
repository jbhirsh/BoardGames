import type { CollectionMode, FilterState, SortMode } from '../data/types';
import { initialFilterState } from '../data/initialFilterState';

/**
 * The parts of the state that narrow the list, as against how it is sorted,
 * laid out or which list it is. Each is off at its initialFilterState value.
 */
export type FilterField = 'duration' | 'players' | 'keywords' | 'search';
export const FILTER_FIELDS: readonly FilterField[] = ['duration', 'players', 'keywords', 'search'];

/** Some of the filters' values, to set together. */
export type FilterPatch = Partial<Pick<FilterState, FilterField>>;

const IS_ON: { [F in FilterField]: (value: FilterState[F]) => boolean } = {
  duration: (d) => d !== initialFilterState.duration,
  players: (p) => p !== initialFilterState.players,
  keywords: (k) => k.size > 0,
  search: (q) => q !== initialFilterState.search,
};

/** Whether a filter is set to anything but off. */
export function filterOn<F extends FilterField>(state: Pick<FilterState, F>, field: F): boolean {
  return IS_ON[field](state[field]);
}

/** Whether any of `fields` is on. */
export function anyFilterOn<F extends FilterField>(state: Pick<FilterState, F>, fields: readonly F[]): boolean {
  return fields.some((f) => filterOn(state, f));
}

/** The state with the filters in `patch` set and everything else kept. */
export function withFilters(state: FilterState, patch: FilterPatch): FilterState {
  const { duration = state.duration, players = state.players, keywords = state.keywords, search = state.search } = patch;
  return { ...state, duration, players, keywords, search };
}

/** The state with `fields` (every filter by default) turned off and everything else kept. */
export function clearFilters(state: FilterState, fields: readonly FilterField[] = FILTER_FIELDS): FilterState {
  const clear = (f: FilterField) => fields.includes(f);
  return withFilters(state, {
    duration: clear('duration') ? initialFilterState.duration : state.duration,
    players: clear('players') ? initialFilterState.players : state.players,
    keywords: clear('keywords') ? new Set() : state.keywords,
    search: clear('search') ? initialFilterState.search : state.search,
  });
}

/**
 * Whether a list can be put in this order: only the wishlist has votes to
 * sort by, and only the collection a difficulty (nor the column to show it).
 */
export function sortAllowed(sort: SortMode, collection: CollectionMode): boolean {
  if (sort === 'votes') return collection === 'want';
  if (sort === 'weight-asc' || sort === 'weight-desc') return collection === 'own';
  return true;
}
