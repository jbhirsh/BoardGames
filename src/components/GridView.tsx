import { useFilterResults } from '../context/useFilter';
import NoResults from './NoResults';
import { GROUPS } from '../data/keywords';
import GameCard from './GameCard';

export default function GridView() {
  const { filteredGames, gameGroups } = useFilterResults();

  if (filteredGames.length === 0) return <NoResults kind="games" />;

  // The flat list is one grid; each group gets a heading over its own.
  return gameGroups.map(({ key, items }) => {
    const grid = (
      <div className="games-grid" key="all">
        {items.map((g) => (
          <GameCard key={g.name} game={g} />
        ))}
      </div>
    );
    return key ? (
      <div key={key}>
        <div className="group-hd">{GROUPS[key]}</div>
        {grid}
      </div>
    ) : (
      grid
    );
  });
}
