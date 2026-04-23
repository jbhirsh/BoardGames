import { useReducer, useMemo, useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { filterReducer } from './filterReducer';
import { GAMES } from '../data/games';
import { filterGames } from '../utils/filterGames';
import { FilterContext } from './filterContextValue';
import {
  filterToSearchParams,
  searchParamsToFilter,
} from '../utils/filterUrl';

export function FilterProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [state, dispatch] = useReducer(
    filterReducer,
    location.search,
    (search) => searchParamsToFilter(new URLSearchParams(search)),
  );

  useEffect(() => {
    if (location.pathname !== '/') return;
    const query = filterToSearchParams(state).toString();
    const target = query ? `/?${query}` : '/';
    const current = location.pathname + location.search;
    if (current !== target) {
      navigate(target, { replace: true });
    }
    // location.search is intentionally omitted: target is derived from state,
    // and navigate() updates location.search which would re-trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, location.pathname, navigate]);

  const filteredGames = useMemo(() => filterGames(GAMES, state), [state]);

  const value = useMemo(() => ({ state, dispatch, filteredGames }), [state, dispatch, filteredGames]);

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}
