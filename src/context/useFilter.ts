import { useContext, type Context, type Dispatch } from 'react';
import {
  FilterDispatchContext,
  FilterLayoutContext,
  FilterResultsContext,
  ItemFilterContext,
  type FilterContextValue,
  type FilterLayout,
  type FilterResults,
  type ItemFilter,
} from './filterContextValue';
import type { FilterAction } from './filterReducer';

function useProvided<T>(context: Context<T | null>, hook: string): T {
  const value = useContext(context);
  if (!value) throw new Error(`${hook} must be used within FilterProvider`);
  return value;
}

/** The whole store; re-renders on every filter change. */
export function useFilter(): FilterContextValue {
  return { ...useFilterResults(), dispatch: useFilterDispatch() };
}

/** The state and the filtered collection; re-renders on every filter change. */
export function useFilterResults(): FilterResults {
  return useProvided(FilterResultsContext, 'useFilterResults');
}

/** Dispatch alone, which never changes, so it never re-renders anything. */
export function useFilterDispatch(): Dispatch<FilterAction> {
  return useProvided(FilterDispatchContext, 'useFilterDispatch');
}

/** What a card or row shows of the filters (see ItemFilter). */
export function useItemFilter(): ItemFilter {
  return useProvided(ItemFilterContext, 'useItemFilter');
}

/** Which list shows, and in which view. */
export function useFilterLayout(): FilterLayout {
  return useProvided(FilterLayoutContext, 'useFilterLayout');
}
