import { useState, Fragment } from 'react';
import { useFilter } from '../context/FilterContext';
import { GROUPS, GROUP_ORDER } from '../data/keywords';
import GameRow from './GameRow';
import type { GroupId } from '../data/types';

export default function ListView() {
  const { state, dispatch, filteredGames } = useFilter();
  const [openRow, setOpenRow] = useState<string | null>(null);

  function clickColSort(col: string) {
    dispatch({ type: 'SET_COLUMN_SORT', payload: col });
  }

  function thClass(col: string) {
    const classes = ['sortable'];
    if (state.sort === col + '-asc') classes.push('sort-asc');
    if (state.sort === col + '-desc') classes.push('sort-desc');
    return classes.join(' ');
  }

  function sortIcon(col: string) {
    if (state.sort === col + '-asc') return '\u25B2';
    if (state.sort === col + '-desc') return '\u25BC';
    return '\u25B2';
  }

  if (filteredGames.length === 0) {
    return <div className="no-results-list">No games match your filters.</div>;
  }

  const isGrouped = state.sort === 'group' || state.baseSort === 'group';
  const colSpan = 6;

  return (
    <div className="table-wrap">
      <table className="games-list">
        <thead>
          <tr>
            <th className={thClass('name')} onClick={() => clickColSort('name')}>
              Name <span className="sort-icon">{sortIcon('name')}</span>
            </th>
            <th className={`col-hide col-players-h ${thClass('players')}`} onClick={() => clickColSort('players')}>
              Players <span className="sort-icon">{sortIcon('players')}</span>
            </th>
            <th className={thClass('dur')} onClick={() => clickColSort('dur')}>
              Duration <span className="sort-icon">{sortIcon('dur')}</span>
            </th>
            <th className="col-hide col-desc">Description</th>
            <th className="col-hide col-tags">Tags</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {isGrouped
            ? GROUP_ORDER.map((groupId: GroupId) => {
                const games = filteredGames.filter((g) => g.group === groupId);
                if (games.length === 0) return null;
                return (
                  <Fragment key={groupId}>
                    <tr className="list-group-row">
                      <td colSpan={colSpan}>{GROUPS[groupId]}</td>
                    </tr>
                    {games.map((g) => (
                      <GameRow
                        key={g.name}
                        game={g}
                        isOpen={openRow === g.name}
                        onToggle={() => setOpenRow(openRow === g.name ? null : g.name)}
                        showGroupBadge={false}
                      />
                    ))}
                  </Fragment>
                );
              })
            : filteredGames.map((g) => (
                <GameRow
                  key={g.name}
                  game={g}
                  isOpen={openRow === g.name}
                  onToggle={() => setOpenRow(openRow === g.name ? null : g.name)}
                  showGroupBadge={false}
                />
              ))}
        </tbody>
      </table>
    </div>
  );
}
