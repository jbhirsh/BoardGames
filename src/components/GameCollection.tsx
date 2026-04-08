import { useFilter } from '../context/useFilter';
import ViewToggle from './ViewToggle';
import GridView from './GridView';
import ListView from './ListView';

export default function GameCollection() {
  const { state, filteredGames } = useFilter();

  return (
    <section>
      <div className="sec-hd">
        <h2 className="sec-title">Our Collection</h2>
        <span className="sec-count">{filteredGames.length} games</span>
        <div className="sec-right">
          <ViewToggle />
        </div>
      </div>
      {state.view === 'grid' ? <GridView /> : <ListView />}
    </section>
  );
}
