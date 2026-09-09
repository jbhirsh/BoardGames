import { useRef } from 'react';
import { useFilter } from '../context/useFilter';
import { useKeepSectionInView } from '../hooks/useKeepSectionInView';
import ViewToggle from './ViewToggle';
import CollectionToggle from './CollectionToggle';
import GridView from './GridView';
import ListView from './ListView';

/**
 * The "We own" view. Stays mounted while the wishlist is showing (just
 * hidden) so its loaded ownership and expanded row survive a toggle; only
 * the visible section carries the `collection` anchor id.
 */
export default function GameCollection({ hidden = false }: { hidden?: boolean }) {
  const { state, filteredGames } = useFilter();
  const sectionRef = useRef<HTMLElement>(null);
  useKeepSectionInView(sectionRef, !hidden);

  return (
    <section id={hidden ? undefined : 'collection'} ref={sectionRef} hidden={hidden}>
      <div className="sec-hd">
        <h2 className="sec-title">Our Collection</h2>
        <span className="sec-count">{filteredGames.length} games</span>
        <div className="sec-right">
          <CollectionToggle />
          <ViewToggle />
        </div>
      </div>
      {state.view === 'grid' ? <GridView /> : <ListView />}
    </section>
  );
}
