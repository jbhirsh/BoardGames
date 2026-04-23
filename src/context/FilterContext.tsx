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

// Must be rendered inside a React Router context (calls useLocation / useNavigate).
export function FilterProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [state, dispatch] = useReducer(
    filterReducer,
    location.search,
    (search) => searchParamsToFilter(new URLSearchParams(search)),
  );

  // ref-update effects must precede sync effects so cross-reads are fresh.
  const stateRef = useRef(state);
  const locationRef = useRef(location);
  const wroteUrlRef = useRef(false);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // state → URL: only dep is state, so it never fires on external URL changes.
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
    wroteUrlRef.current = true;
    navigate(target, { replace: true });
  }, [state, navigate]);

  // URL → state: dep is location only; wroteUrlRef skips HYDRATE after our own navigate.
  useEffect(() => {
    if (location.pathname !== '/') return;
    if (wroteUrlRef.current) {
      // state→URL fired first this cycle; our navigate already wrote the correct URL.
      wroteUrlRef.current = false;
      return;
    }
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
