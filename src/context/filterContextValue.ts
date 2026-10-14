import { createContext, type Dispatch } from 'react';
import type { CollectionMode, FilterState, Game, KeywordId, ViewMode, WishlistItem } from '../data/types';
import type { FilterAction } from './filterReducer';
import type { GameGroup, TableFilter } from '../utils/filterGames';

/**
 * The filter store is split by how often each part changes, so a component
 * re-renders only for what it reads: a search keystroke reaches the lists
 * and the bar, not the page around them or a card it leaves as it was.
 */

/** The state and the collection it leaves; changes with every filter change. */
export interface FilterResults {
  state: FilterState;
  filteredGames: Game[];
  /** filteredGames as the views lay it out: by group, or one flat list. */
  gameGroups: GameGroup[];
}

/** Everything at once, for a component that needs most of it. */
export interface FilterContextValue extends FilterResults {
  dispatch: Dispatch<FilterAction>;
}

/**
 * What one game's card or row shows of the filters: which of its games fit
 * the players and time, and which of its keywords light. Search, sort, view
 * and list leave it alone unless the search lights a keyword or puts one out.
 */
export interface ItemFilter extends TableFilter {
  lit: ReadonlySet<KeywordId>;
}

/** Which list the page shows, and how; changes only with the toggles. */
export interface FilterLayout {
  collection: CollectionMode;
  view: ViewMode;
}

export const FilterDispatchContext = createContext<Dispatch<FilterAction> | null>(null);
export const FilterResultsContext = createContext<FilterResults | null>(null);
export const ItemFilterContext = createContext<ItemFilter | null>(null);
export const FilterLayoutContext = createContext<FilterLayout | null>(null);

/**
 * The wishlist the filters leave, worked out once for the page by
 * WishlistProvider; null outside it.
 */
export const FilteredWishlistContext = createContext<WishlistItem[] | null>(null);
