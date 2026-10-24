import type { ReactNode } from 'react';
import type { SortColumn } from '../data/types';
import { useFilter } from '../context/useFilter';
import { headCellClass } from './tableClasses';

/** Columns the shared header renders on its own; a list's `extra` adds to it. */
export const TABLE_COLUMNS = 6;
/** The collection's columns: the shared ones and its difficulty column. */
export const COLLECTION_COLUMNS = TABLE_COLUMNS + 1;

/**
 * The column headers both list views share. Name, players and duration sort
 * on click; `difficulty` adds the collection's sortable difficulty column
 * after duration, and `extra` slots any list-specific column in before the
 * actions.
 */
export default function GamesTableHead({ extra, difficulty = false }: { extra?: ReactNode; difficulty?: boolean }) {
  const { state, dispatch } = useFilter();

  function thClass(col: SortColumn, base = '') {
    const classes = [base, 'sortable', headCellClass, 'cursor-pointer select-none hover:bg-bg3 hover:text-dark'];
    if (state.sort === col + '-asc') classes.push('sort-asc');
    if (state.sort === col + '-desc') classes.push('sort-desc');
    return classes.filter(Boolean).join(' ');
  }
  const sorted = (col: SortColumn) => state.sort === col + '-asc' || state.sort === col + '-desc';

  function sortIcon(col: SortColumn) {
    if (state.sort === col + '-desc') return '▼';
    return '▲';
  }

  const sortable = (col: SortColumn, label: string, base = '') => (
    <th className={thClass(col, base)} onClick={() => dispatch({ type: 'SET_COLUMN_SORT', payload: col })}>
      {label}{' '}
      <span className={`ml-0.75 inline-block text-[8px] ${sorted(col) ? 'text-blue opacity-100' : 'opacity-[0.3]'}`}>
        {sortIcon(col)}
      </span>
    </th>
  );

  return (
    <thead>
      <tr>
        {sortable('name', 'Name', 'xl:w-65')}
        {sortable('players', 'Players', 'hidden lg:table-cell lg:max-xl:w-18')}
        {sortable('dur', 'Duration', 'w-[1%] sm:w-26 xl:w-auto')}
        {difficulty && sortable('weight', 'Difficulty', 'hidden 2xl:table-cell')}
        <th className={`${headCellClass} hidden xl:table-cell`}>Description</th>
        <th className={`${headCellClass} hidden xl:table-cell`}>Tags</th>
        {extra}
        <th className={`${headCellClass} w-[1%] sm:w-13 xl:w-auto`}>
          <span className="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
  );
}
