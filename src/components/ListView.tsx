import { useState, Fragment } from 'react';
import { useFilter } from '../context/useFilter';
import { isGrouped } from '../utils/filterGames';
import NoResults from './NoResults';
import GamesTableHead, { TABLE_COLUMNS } from './GamesTableHead';
import { GROUPS, GROUP_ORDER } from '../data/keywords';
import GameRow from './GameRow';
import type { GroupId } from '../data/types';

export default function ListView() {
  const { state, filteredGames } = useFilter();
  const [openRow, setOpenRow] = useState<string | null>(null);

  if (filteredGames.length === 0) return <NoResults message="No games match your filters." />;

  const grouped = isGrouped(state);

  return (
    <div className="table-wrap">
      <table className="games-list">
        <GamesTableHead />
        <tbody>
          {grouped
            ? GROUP_ORDER.map((groupId: GroupId) => {
                const games = filteredGames.filter((g) => g.group === groupId);
                if (games.length === 0) return null;
                return (
                  <Fragment key={groupId}>
                    <tr className="list-group-row">
                      <td colSpan={TABLE_COLUMNS}>{GROUPS[groupId]}</td>
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
