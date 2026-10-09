import type { FilterState, DurationFilter, SortMode, ViewMode, KeywordId, KeywordMode, CollectionMode } from '../data/types';
import { initialFilterState } from '../data/initialFilterState';

export type FilterAction =
  | { type: 'SET_DURATION'; payload: DurationFilter }
  | { type: 'SET_PLAYERS'; payload: number }
  | { type: 'TOGGLE_KEYWORD'; payload: KeywordId }
  | { type: 'CLEAR_KEYWORDS' }
  | { type: 'SET_KEYWORD_MODE'; payload: KeywordMode }
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'SET_SORT'; payload: SortMode }
  | { type: 'SET_COLUMN_SORT'; payload: string }
  | { type: 'SET_VIEW'; payload: ViewMode }
  | { type: 'SET_COLLECTION'; payload: CollectionMode }
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
    case 'CLEAR_KEYWORDS':
      return { ...state, keywords: new Set() };
    case 'SET_KEYWORD_MODE':
      return { ...state, keywordMode: action.payload };
    case 'SET_SEARCH':
      return { ...state, search: action.payload };
    case 'SET_SORT':
      return { ...state, sort: action.payload, baseSort: action.payload };
    case 'SET_COLUMN_SORT': {
      const col = action.payload;
      const newSort = (state.sort === col + '-asc' ? col + '-desc' : col + '-asc') as SortMode;
      return { ...state, sort: newSort };
    }
    case 'SET_VIEW':
      return { ...state, view: action.payload };
    case 'SET_COLLECTION':
      // The collection has no votes: leaving the wishlist on its vote sort
      // goes back to the default order.
      if (action.payload === 'own' && state.baseSort === 'votes') {
        // A column sort on top of it comes along, as it does for any sort.
        const sort = state.sort === 'votes' ? initialFilterState.sort : state.sort;
        return { ...state, collection: 'own', sort, baseSort: initialFilterState.sort };
      }
      // The wishlist has no difficulty to sort by (nor the column to show
      // it): a difficulty sort goes back to the order it was on.
      if (action.payload === 'want' && state.sort.startsWith('weight-')) {
        return { ...state, collection: 'want', sort: state.baseSort };
      }
      return { ...state, collection: action.payload };
    case 'HYDRATE':
      return action.payload;
    case 'CLEAR_ALL':
      return {
        ...initialFilterState,
        keywords: new Set(),
        view: state.view,
        collection: state.collection,
        sort: state.baseSort,
        baseSort: state.baseSort,
      };
    default:
      return state;
  }
}
