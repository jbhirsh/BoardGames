import type { DetailSection } from '../data/types';

/**
 * A game's long write-up, one section after another, each a heading over
 * its paragraph: on a card's More, an open list row and an add-on's More.
 */
export default function GameDetail({ sections }: { sections: DetailSection[] }) {
  return (
    <>
      {sections.map((s) => (
        <div key={s.heading} className="detail-section">
          <h3>{s.heading}</h3>
          <p>{s.body}</p>
        </div>
      ))}
    </>
  );
}
