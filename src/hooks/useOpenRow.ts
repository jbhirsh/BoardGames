import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { openRowFrom, withOpenRow } from '../utils/openRow';

/**
 * Which row of a list is open, and a toggle for it. The open row starts
 * from the page's history entry and is written back to it on each toggle
 * (a `replace` to the same URL that leaves the scroll alone), so Back from
 * a page one of its links opened finds the same row open. It is open from
 * the first render, so ScrollRestoration measures the page at its full
 * height and lands where it was left.
 */
export function useOpenRow(): [string | null, (row: string) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const [openRow, setOpenRow] = useState(() => openRowFrom(location.state));

  const toggle = (row: string) => {
    const next = openRow === row ? null : row;
    setOpenRow(next);
    const { pathname, search, hash } = location;
    navigate(
      { pathname, search, hash },
      { replace: true, preventScrollReset: true, state: withOpenRow(location.state, next) },
    );
  };

  return [openRow, toggle];
}
