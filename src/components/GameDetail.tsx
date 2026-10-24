import type { DetailSection } from '../data/types';
import {
  detailHeadingClass,
  detailSectionClass,
  detailTextClass,
  smallDetailHeadingClass,
  smallDetailTextClass,
} from './sharedClasses';

/**
 * A game's long write-up, one section after another, each a heading over
 * its paragraph: on a card's More, an open list row and an add-on's More
 * (`small`, a size down).
 */
export default function GameDetail({ sections, small = false }: { sections: DetailSection[]; small?: boolean }) {
  return (
    <>
      {sections.map((s) => (
        <div key={s.heading} className={detailSectionClass}>
          <h3 className={small ? smallDetailHeadingClass : detailHeadingClass}>{s.heading}</h3>
          <p className={small ? smallDetailTextClass : detailTextClass}>{s.body}</p>
        </div>
      ))}
    </>
  );
}
