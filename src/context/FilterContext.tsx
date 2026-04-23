import { useReducer, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { filterReducer } from './filterReducer';
import { GAMES } from '../data/games';
import { filterGames } from '../utils/filterGames';
import { FilterContext } from './filterContextValue';
import { searchParamsToFilter } from '../utils/filterUrl';
import { useFilterUrlSync } from './useFilterUrlSync';

/** Requires a React Router context. Do not mix dispatch + navigate() — dispatch wins and the navigate's params are dropped. */
export function FilterProvider({ children }: { children: ReactNode }) {
  const location = useLocation();

  const [state, dispatch] = useReducer(
    filterReducer,
    location.search,
    (search) => searchParamsToFilter(new URLSearchParams(search)),
  );

  useFilterUrlSync(state, dispatch);

  const filteredGames = useMemo(() => filterGames(GAMES, state), [state]);

  const value = useMemo(() => ({ state, dispatch, filteredGames }), [state, dispatch, filteredGames]);

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}
