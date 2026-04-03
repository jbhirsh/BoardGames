import { createContext, useContext, useReducer, useMemo, type ReactNode, type Dispatch } from 'react';
import type { FilterState } from '../data/types';
import { type FilterAction, filterReducer, initialFilterState } from './filterReducer';
import { GAMES } from '../data/games';
import { filterGames } from '../utils/filterGames';
import type { Game } from '../data/types';

interface FilterContextValue {
  state: FilterState;
  dispatch: Dispatch<FilterAction>;
  filteredGames: Game[];
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(filterReducer, initialFilterState);

  const filteredGames = useMemo(() => filterGames(GAMES, state), [state]);

  const value = useMemo(() => ({ state, dispatch, filteredGames }), [state, dispatch, filteredGames]);

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilter must be used within FilterProvider');
  return ctx;
}
