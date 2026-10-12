import { Fragment } from 'react';
import { useFilter } from '../context/useFilter';
import { isGrouped } from '../utils/filterGames';
import NoResults from './NoResults';
import GamesTableHead, { COLLECTION_COLUMNS } from './GamesTableHead';
import { GROUPS, GROUP_ORDER } from '../data/keywords';
import GameRow from './GameRow';
import { useOpenRow } from '../hooks/useOpenRow';
import type { GroupId } from '../data/types';

export default function ListView() {
  const { state, filteredGames } = useFilter();
  // Kept in the page's history entry, so Back from a row's Rules finds it open.
  const [openRow, toggleRow] = useOpenRow();

  if (filteredGames.length === 0) return <NoResults kind="games" />;

  const grouped = isGrouped(state);

  return (
    <div className="table-wrap">
      <table className="games-list">
        <GamesTableHead difficulty />
        <tbody>
          {grouped
            ? GROUP_ORDER.map((groupId: GroupId) => {
                const games = filteredGames.filter((g) => g.group === groupId);
                if (games.length === 0) return null;
                return (
                  <Fragment key={groupId}>
                    <tr className="list-group-row">
                      <td colSpan={COLLECTION_COLUMNS}>{GROUPS[groupId]}</td>
                    </tr>
                    {games.map((g) => (
                      <GameRow
                        key={g.name}
                        game={g}
                        isOpen={openRow === g.name}
                        onToggle={() => toggleRow(g.name)}
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
                  onToggle={() => toggleRow(g.name)}
                  showGroupBadge={false}
                />
              ))}
        </tbody>
      </table>
    </div>
  );
}
