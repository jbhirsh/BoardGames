import type { ReactNode } from 'react';
import { useFilter } from '../context/useFilter';

/** Columns the shared header renders on its own; a list's `extra` adds to it. */
export const TABLE_COLUMNS = 6;

/**
 * The column headers both list views share. Name, players and duration sort
 * on click; `extra` slots any list-specific column in before the actions.
 */
export default function GamesTableHead({ extra }: { extra?: ReactNode }) {
  const { state, dispatch } = useFilter();

  function thClass(col: string, base = '') {
    const classes = base ? [base, 'sortable'] : ['sortable'];
    if (state.sort === col + '-asc') classes.push('sort-asc');
    if (state.sort === col + '-desc') classes.push('sort-desc');
    return classes.join(' ');
  }

  function sortIcon(col: string) {
    if (state.sort === col + '-desc') return '▼';
    return '▲';
  }

  const sortable = (col: string, label: string, base = '') => (
    <th className={thClass(col, base)} onClick={() => dispatch({ type: 'SET_COLUMN_SORT', payload: col })}>
      {label} <span className="sort-icon">{sortIcon(col)}</span>
    </th>
  );

  return (
    <thead>
      <tr>
        {sortable('name', 'Name')}
        {sortable('players', 'Players', 'col-hide col-players-h')}
        {sortable('dur', 'Duration')}
        <th className="col-hide col-desc">Description</th>
        <th className="col-hide col-tags">Tags</th>
        {extra}
        <th><span className="sr-only">Actions</span></th>
      </tr>
    </thead>
  );
}
