import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { openRowFrom, withOpenRow } from '../utils/openRow';

/**
 * Which row of a list is open, and a toggle for it. The open row starts
 * from the page's history entry and is written back to it on each toggle
 * (a `replace` to the same URL that leaves the scroll alone), so Back from
 * a page one of its links opened finds the same row open. It is open from
 * the first render, so ScrollRestoration measures the page at its full
 * height and lands where it was left; a row inserted open never runs its
 * slide-open transition, so the offset lands on its actions again. The
 * filter URL sync's own replaces carry the entry's state over, and a fresh
 * visit to / opens no row. The toggle keeps its identity across filter
 * changes (each one moves the URL), so the rows it is handed to can skip a
 * redraw.
 */
export function useOpenRow(): [string | null, (row: string) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const [openRow, setOpenRow] = useState(() => openRowFrom(location.state));
  // Kept up to date after each render, before anything can be clicked, so
  // the toggle reads the current row and URL.
  const latest = useRef({ openRow, location });
  useLayoutEffect(() => {
    latest.current = { openRow, location };
  });

  const toggle = useCallback(
    (row: string) => {
      const { openRow, location } = latest.current;
      const next = openRow === row ? null : row;
      setOpenRow(next);
      const { pathname, search, hash } = location;
      navigate(
        { pathname, search, hash },
        { replace: true, preventScrollReset: true, state: withOpenRow(location.state, next) },
      );
    },
    [navigate],
  );

  return [openRow, toggle];
}
