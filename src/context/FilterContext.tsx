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
    // Canonicalise the current URL through the same parse+serialise pipeline
    // so differences in parameter order (?p=4&d=quick vs ?d=quick&p=4) and
    // encoding (%20 vs '+') don't trigger a cosmetic replace-navigate on
    // mount. This also breaks the navigate → location.search → re-run loop.
    const currentQuery = filterToSearchParams(
      searchParamsToFilter(new URLSearchParams(location.search)),
    ).toString();
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
