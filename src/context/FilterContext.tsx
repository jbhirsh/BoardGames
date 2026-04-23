import { useReducer, useMemo, useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { filterReducer } from './filterReducer';
import { GAMES } from '../data/games';
import { filterGames } from '../utils/filterGames';
import { FilterContext } from './filterContextValue';
import {
  filterToSearchParams,
  hydrateFilterStateFromLocation,
} from '../utils/filterUrl';

export function FilterProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    filterReducer,
    undefined,
    hydrateFilterStateFromLocation,
  );

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname !== '/') return;
    const query = filterToSearchParams(state).toString();
    const target = query ? `/?${query}` : '/';
    const current = location.pathname + location.search;
    if (current !== target) {
      navigate(target, { replace: true });
    }
  }, [state, location.pathname, location.search, navigate]);

  const filteredGames = useMemo(() => filterGames(GAMES, state), [state]);

  const value = useMemo(() => ({ state, dispatch, filteredGames }), [state, dispatch, filteredGames]);

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}
