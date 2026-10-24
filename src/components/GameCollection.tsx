import { useRef } from 'react';
import { useFilterResults } from '../context/useFilter';
import { useKeepSectionInView } from '../hooks/useKeepSectionInView';
import { useIsPhone } from '../hooks/useIsPhone';
import ViewToggle from './ViewToggle';
import ViewFlip from './ViewFlip';
import CollectionToggle from './CollectionToggle';
import GridView from './GridView';
import ListView from './ListView';
import PhoneListView from './PhoneListView';
import RandomPicker from './RandomPicker';
import ComingSoon from './ComingSoon';
import {
  sectionCountClass,
  sectionHeadClass,
  sectionNameClass,
  sectionSwitchClass,
  sectionTitleClass,
} from './sharedClasses';

/**
 * The "We own" view, with what's on its way listed under it (ComingSoon, a
 * section of its own, so nothing that reads the collection reads those).
 * Stays mounted while the wishlist is showing (just hidden) so its expanded
 * row survives a toggle; only the visible section carries the `collection`
 * anchor id.
 */
export default function GameCollection({ hidden = false }: { hidden?: boolean }) {
  const { state, filteredGames } = useFilterResults();
  // A phone's list is its own (PhoneListView, a line a game): the table has
  // too few columns to be useful there. Its Pick for us and Own/Want move to
  // the bar along the bottom (PhoneNav), leaving the heading one line, with
  // a quiet rows-or-cards switch at its end (ViewFlip).
  const isPhone = useIsPhone();
  const sectionRef = useRef<HTMLElement>(null);
  useKeepSectionInView(sectionRef, !hidden);

  return (
    <>
      <section id={hidden ? undefined : 'collection'} ref={sectionRef} hidden={hidden}>
        <div className={sectionHeadClass}>
          <div className={sectionNameClass}>
            <h2 className={sectionTitleClass} tabIndex={-1} data-focus-target="title">
              Our Collection
            </h2>
            <span className={sectionCountClass}>
              {filteredGames.length} {filteredGames.length === 1 ? 'game' : 'games'}
            </span>
          </div>
          {/* On the heading's line, beside the count it picks from. */}
          {!isPhone && <RandomPicker />}
          <div className={sectionSwitchClass}>
            {!isPhone && <CollectionToggle />}
            {isPhone ? <ViewFlip /> : <ViewToggle />}
          </div>
        </div>
        {state.view === 'grid' ? <GridView /> : isPhone ? <PhoneListView /> : <ListView />}
      </section>
      <ComingSoon hidden={hidden} />
    </>
  );
}
