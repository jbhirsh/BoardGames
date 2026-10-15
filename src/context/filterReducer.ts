import type { FilterState, DurationFilter, SortColumn, BaseSort, ViewMode, KeywordId, KeywordMode, CollectionMode, ColumnSort } from '../data/types';
import { initialFilterState } from '../data/initialFilterState';
import { clearFilters, sortAllowed, withFilters, type FilterField, type FilterPatch } from '../utils/filterState';

export type FilterAction =
  | { type: 'SET_DURATION'; payload: DurationFilter }
  | { type: 'SET_PLAYERS'; payload: number }
  | { type: 'TOGGLE_KEYWORD'; payload: KeywordId }
  | { type: 'SET_KEYWORD_MODE'; payload: KeywordMode }
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'SET_SORT'; payload: BaseSort }
  | { type: 'SET_COLUMN_SORT'; payload: SortColumn }
  | { type: 'SET_VIEW'; payload: ViewMode }
  | { type: 'SET_COLLECTION'; payload: CollectionMode }
  /** Sets some filters at once, leaving the sort, view and list alone. */
  | { type: 'SET_FILTERS'; payload: FilterPatch }
  /** Turns off the given filters (every one when absent), keeping the rest. */
  | { type: 'CLEAR_FILTERS'; payload?: readonly FilterField[] }
  /** The URL's state, read back after Back, Forward or a link (useFilterUrlSync). */
  | { type: 'HYDRATE'; payload: FilterState }
  | { type: 'CLEAR_ALL' };

export function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_DURATION':
      return { ...state, duration: action.payload };
    case 'SET_PLAYERS':
      return { ...state, players: action.payload };
    case 'TOGGLE_KEYWORD': {
      const next = new Set(state.keywords);
      if (next.has(action.payload)) next.delete(action.payload);
      else next.add(action.payload);
      return { ...state, keywords: next };
    }
    case 'SET_KEYWORD_MODE':
      return { ...state, keywordMode: action.payload };
    case 'SET_SEARCH':
      return { ...state, search: action.payload };
    case 'SET_SORT':
      return { ...state, sort: action.payload, baseSort: action.payload };
    case 'SET_COLUMN_SORT': {
      const asc: ColumnSort = `${action.payload}-asc`;
      return { ...state, sort: state.sort === asc ? `${action.payload}-desc` : asc };
    }
    case 'SET_VIEW':
      return { ...state, view: action.payload };
    case 'SET_COLLECTION': {
      const collection = action.payload;
      // A sort the other list can't do gives way: the base sort (the
      // wishlist's votes) to the default order, and a column sort (the
      // collection's difficulty) to the base sort it was on. A column sort
      // the list can do comes along, as it does for any base sort.
      const baseSort = sortAllowed(state.baseSort, collection) ? state.baseSort : initialFilterState.baseSort;
      const sort = sortAllowed(state.sort, collection) ? state.sort : baseSort;
      return { ...state, collection, sort, baseSort };
    }
    case 'SET_FILTERS':
      return withFilters(state, action.payload);
    case 'CLEAR_FILTERS':
      return clearFilters(state, action.payload);
    case 'HYDRATE':
      return action.payload;
    case 'CLEAR_ALL':
      // Every filter and the keyword mode go back to the start, and a column
      // sort to its base; the sort, view and list stay as chosen.
      return { ...clearFilters(state), keywordMode: initialFilterState.keywordMode, sort: state.baseSort };
    default:
      return state;
  }
}
