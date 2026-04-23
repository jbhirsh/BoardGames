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
    // Normalise both sides before comparing so incoming %20 vs our '+'
    // encoding don't trigger a cosmetic re-navigate on mount. The guard
    // also breaks the navigate → location.search change → re-run loop.
    const currentQuery = new URLSearchParams(location.search).toString();
    const current = location.pathname + (currentQuery ? `?${currentQuery}` : '');
    if (current === target) return;
    navigate(target, { replace: true });
  }, [state, location.pathname, location.search, navigate]);

  const filteredGames = useMemo(() => filterGames(GAMES, state), [state]);

  const value = useMemo(() => ({ state, dispatch, filteredGames }), [state, dispatch, filteredGames]);

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}
