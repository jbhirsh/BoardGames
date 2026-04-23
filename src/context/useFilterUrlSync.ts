import { useEffect, useRef, type Dispatch } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  filterToSearchParams,
  searchParamsToFilter,
} from '../utils/filterUrl';
import type { FilterAction } from './filterReducer';
import type { FilterState } from '../data/types';

/** Bidirectional URL ↔ state sync; the two effects must stay in this order because wroteUrlRef relies on state→URL firing first. */
export function useFilterUrlSync(state: FilterState, dispatch: Dispatch<FilterAction>) {
  const location = useLocation();
  const navigate = useNavigate();

  // Written during render so effects always see the latest values without a declaration-order dependency.
  const stateRef = useRef(state);
  const locationRef = useRef(location);
  const wroteUrlRef = useRef(false);
  stateRef.current = state;
  locationRef.current = location;

  // state → URL: must be declared BEFORE the URL → state effect — wroteUrlRef relies on React's declaration-order effect flush.
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
      // State→URL already won; hydrating here would revert it (dispatch+navigate is lossy by design).
      wroteUrlRef.current = false;
      return;
    }
    const urlState = searchParamsToFilter(new URLSearchParams(location.search));
    const stateQuery = filterToSearchParams(stateRef.current).toString();
    const urlQuery = filterToSearchParams(urlState).toString();
    if (stateQuery === urlQuery) return;
    dispatch({ type: 'HYDRATE', payload: urlState });
  }, [location.pathname, location.search, dispatch]);
}
