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

  // INVARIANT: the four useEffect blocks below must stay in this order — the two
  // ref-update effects must fire before the two sync effects each commit, so the
  // sync effects read post-update values of the other side. React runs effects in
  // declaration order within a component; reordering or extracting to a hook would
  // silently break the sync without a test failure.
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
      // Our own navigate just landed. Skipping HYDRATE means any params
      // the caller tried to set via a same-handler navigate() are dropped,
      // not merged — a dispatch + navigate pair is a lossy operation.
      wroteUrlRef.current = false;
      return;
    }
    const urlState = searchParamsToFilter(new URLSearchParams(location.search));
    const stateQuery = filterToSearchParams(stateRef.current).toString();
    const urlQuery = filterToSearchParams(urlState).toString();
    if (stateQuery === urlQuery) return;
    dispatch({ type: 'HYDRATE', payload: urlState });
  }, [location.pathname, location.search, dispatch]);

  const filteredGames = useMemo(() => filterGames(GAMES, state), [state]);

  const value = useMemo(() => ({ state, dispatch, filteredGames }), [state, dispatch, filteredGames]);

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}
