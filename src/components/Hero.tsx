import { GAMES } from '../data/games';
import { collectionSpan } from '../utils/collectionStats';
import ThemeToggle from './ThemeToggle';
import CoverCarousel from './CoverCarousel';
import { heroClass, heroSubClass, heroTitleClass } from './heroClasses';

/**
 * The page's title and subtitle over a moving row of box covers. `want` is
 * true while the Own/Want toggle shows the wishlist, which is where a
 * shared wishlist link lands: the subtitle then speaks to the friend who
 * opened it, and the covers are the wishlist's. On a phone the title shares
 * a line with the theme picker and the covers run small under the subtitle
 * (heroClasses.ts), so four games show under Safari's bars where three did.
 */
export default function Hero({ want }: { want: boolean }) {
  const { shortest, longest } = collectionSpan(GAMES);

  return (
    <header className={`${heroClass} border-b border-border`}>
      <ThemeToggle />
      <h1 className={heroTitleClass}>
        Our <em className="text-blue italic">Game</em> Room
      </h1>
      <p className={heroSubClass}>
        {want
          ? 'Help us pick our next game from the wishlist below.'
          : `${GAMES.length} games, ${shortest} to ${longest}. What fits tonight?`}
      </p>
      <CoverCarousel want={want} />
    </header>
  );
}
