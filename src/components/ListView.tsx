import { useFilterResults } from '../context/useFilter';
import NoResults from './NoResults';
import GamesTableHead, { COLLECTION_COLUMNS } from './GamesTableHead';
import GroupedRows from './GroupedRows';
import { GROUPS } from '../data/keywords';
import GameRow from './GameRow';
import { useOpenRow } from '../hooks/useOpenRow';

export default function ListView() {
  const { filteredGames, gameGroups } = useFilterResults();
  // Kept in the page's history entry, so Back from a row's Rules finds it open.
  const [openRow, toggleRow] = useOpenRow();

  if (filteredGames.length === 0) return <NoResults kind="games" />;

  return (
    <div className="table-wrap">
      <table className="games-list">
        <GamesTableHead difficulty />
        <tbody>
          <GroupedRows
            groups={gameGroups}
            labels={GROUPS}
            columns={COLLECTION_COLUMNS}
            row={(g) => <GameRow key={g.name} game={g} isOpen={openRow === g.name} onToggle={toggleRow} />}
          />
        </tbody>
      </table>
    </div>
  );
}
