import { useFilterResults } from '../context/useFilter';
import { useOpenRow } from '../hooks/useOpenRow';
import { GROUPS } from '../data/keywords';
import NoResults from './NoResults';
import GameLine from './GameLine';

/**
 * The collection's list on a phone, a GameLine a game, under the group
 * headings the grid uses. One line opens at a time, kept in the page's
 * history entry as the desktop table's open row is, so Back from its Rules
 * finds it open.
 */
export default function PhoneListView() {
  const { filteredGames, gameGroups } = useFilterResults();
  const [openRow, toggleRow] = useOpenRow();

  if (filteredGames.length === 0) return <NoResults kind="games" />;

  return gameGroups.map(({ key, items }) => {
    const list = (
      <ul className="lines" key="all">
        {items.map((g) => (
          <GameLine key={g.name} game={g} isOpen={openRow === g.name} onToggle={toggleRow} />
        ))}
      </ul>
    );
    return key ? (
      <div key={key}>
        <div className="group-hd">{GROUPS[key]}</div>
        {list}
      </div>
    ) : (
      list
    );
  });
}
