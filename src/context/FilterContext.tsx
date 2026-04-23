import { useReducer, useMemo, useEffect, useRef, type ReactNode } from 'react';
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

  // Each sync direction runs only when *its* source changes, reading the
  // other side through a ref. That prevents the two effects from racing
  // in the same commit: if both state and location were in both dep
  // arrays, a user-dispatched change would trigger URL→state (reverting)
  // and an external URL change would trigger state→URL (reverting).
  const stateRef = useRef(state);
  const locationRef = useRef(location);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // state → URL: fires when state changes. Reads the current location
  // through the ref so it doesn't also fire on URL changes.
  useEffect(() => {
    const loc = locationRef.current;
    if (loc.pathname !== '/') return;
    const query = filterToSearchParams(state).toString();
    const target = query ? `/?${query}` : '/';
    const currentQuery = filterToSearchParams(
      searchParamsToFilter(new URLSearchParams(loc.search)),
    ).toString();
    const current = loc.pathname + (currentQuery ? `?${currentQuery}` : '');
    if (current === target) return;
    navigate(target, { replace: true });
  }, [state, navigate]);

  // URL → state: fires when location changes (back / forward / external
  // navigation). Reads the current state through the ref so it doesn't
  // also fire on state changes.
  useEffect(() => {
    if (location.pathname !== '/') return;
    const urlState = searchParamsToFilter(new URLSearchParams(location.search));
    const stateQuery = filterToSearchParams(stateRef.current).toString();
    const urlQuery = filterToSearchParams(urlState).toString();
    if (stateQuery === urlQuery) return;
    dispatch({ type: 'HYDRATE', payload: urlState });
  }, [location.pathname, location.search]);

  const filteredGames = useMemo(() => filterGames(GAMES, state), [state]);

  const value = useMemo(() => ({ state, dispatch, filteredGames }), [state, dispatch, filteredGames]);

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}
