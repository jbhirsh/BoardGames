import { useReducer, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { filterReducer } from './filterReducer';
import { GAMES } from '../data/games';
import { filterGames, groupGames } from '../utils/filterGames';
import { litKeywords } from '../utils/keywordLit';
import {
  FilterDispatchContext,
  FilterLayoutContext,
  FilterResultsContext,
  ItemFilterContext,
} from './filterContextValue';
import { searchParamsToFilter } from '../utils/filterUrl';
import { useFilterUrlSync } from './useFilterUrlSync';

/**
 * The same set as last time while its members are the same, so most search
 * keystrokes (which light no new keyword) leave every card and row alone.
 * Adjusting state during render, React's pattern for state that follows a
 * value.
 */
function useSameSet<T>(next: Set<T>): ReadonlySet<T> {
  const [held, setHeld] = useState(next);
  const same = held.size === next.size && [...next].every((k) => held.has(k));
  if (!same) setHeld(next);
  return same ? held : next;
}

/** Requires a React Router context. Do not mix dispatch + navigate() — dispatch wins and the navigate's params are dropped. */
export function FilterProvider({ children }: { children: ReactNode }) {
  const location = useLocation();

  const [state, dispatch] = useReducer(filterReducer, location.search, (search) =>
    searchParamsToFilter(new URLSearchParams(search)),
  );

  useFilterUrlSync(state, dispatch);

  const filteredGames = useMemo(() => filterGames(GAMES, state), [state]);
  const gameGroups = useMemo(() => groupGames(filteredGames, state), [filteredGames, state]);
  const results = useMemo(() => ({ state, filteredGames, gameGroups }), [state, filteredGames, gameGroups]);

  const { players, duration, collection, view } = state;
  const lit = useSameSet(litKeywords(state));
  const item = useMemo(() => ({ players, duration, lit }), [players, duration, lit]);
  const layout = useMemo(() => ({ collection, view }), [collection, view]);

  return (
    <FilterDispatchContext.Provider value={dispatch}>
      <FilterResultsContext.Provider value={results}>
        <FilterLayoutContext.Provider value={layout}>
          <ItemFilterContext.Provider value={item}>{children}</ItemFilterContext.Provider>
        </FilterLayoutContext.Provider>
      </FilterResultsContext.Provider>
    </FilterDispatchContext.Provider>
  );
}
