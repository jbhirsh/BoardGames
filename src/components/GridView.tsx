import { useFilter } from '../context/FilterContext';
import { GROUPS, GROUP_ORDER } from '../data/keywords';
import GameCard from './GameCard';
import type { GroupId } from '../data/types';

export default function GridView() {
  const { state, filteredGames } = useFilter();

  if (filteredGames.length === 0) {
    return (
      <div className="no-results">
        <p>No games match your filters.</p>
        <button className="no-results-btn" onClick={() => {}}>Clear filters</button>
      </div>
    );
  }

  if (state.sort === 'group' || state.baseSort === 'group') {
    const groups = GROUP_ORDER.filter((g) => filteredGames.some((gm) => gm.group === g));
    return (
      <>
        {groups.map((groupId: GroupId) => {
          const games = filteredGames.filter((g) => g.group === groupId);
          if (games.length === 0) return null;
          return (
            <div key={groupId}>
              <div className="group-hd">{GROUPS[groupId]}</div>
              <div className="games-grid">
                {games.map((g) => (
                  <GameCard key={g.name} game={g} />
                ))}
              </div>
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div className="games-grid">
      {filteredGames.map((g) => (
        <GameCard key={g.name} game={g} />
      ))}
    </div>
  );
}
