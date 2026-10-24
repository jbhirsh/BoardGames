import { useId, useMemo } from 'react';
import { COMING_SOON } from '../data/games';
import { useFilterResults } from '../context/useFilter';
import { filterGames } from '../utils/filterGames';
import GameCard from './GameCard';
import { cardGridClass, groupHeadingClass } from './sharedClasses';

/**
 * Games we've bought that haven't come yet (`arriving` in games.ts), as cards
 * under the collection. They follow the same filters and search, but they
 * aren't in the collection's count and the random pick never lands on one.
 * Nothing shows while none is due, or none fits the filters; it hides with
 * the collection when the wishlist is showing.
 */
export default function ComingSoon({ hidden = false }: { hidden?: boolean }) {
  const { state } = useFilterResults();
  const headingId = useId();
  const games = useMemo(() => filterGames(COMING_SOON, state), [state]);
  if (games.length === 0) return null;

  return (
    <section className="coming-soon mt-7" hidden={hidden} aria-labelledby={headingId}>
      <h2 className={groupHeadingClass} id={headingId}>
        Coming Soon
      </h2>
      <div className={cardGridClass}>
        {games.map((g) => (
          <GameCard key={g.name} game={g} />
        ))}
      </div>
    </section>
  );
}
