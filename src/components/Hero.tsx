import { Link } from 'react-router';
import { GAMES } from '../data/games';
import { collectionSpan } from '../utils/collectionStats';
import { rulebookPath } from '../utils/rulebooks';
import ThemeToggle from './ThemeToggle';
import { FROM_LIST } from '../utils/fromList';

// A shelf of favourite boxes. Each opens its rulebook, so the row is a way
// in rather than decoration.
const SHELF = ['catan', 'azul', '7-wonders', 'codenames', 'pandemic', 'ticket-to-ride', 'dominion'];

/**
 * The page's title and subtitle. `want` is true while the Own/Want toggle
 * shows the wishlist, which is where a shared wishlist link lands: the
 * subtitle then speaks to the friend who opened it. It points past the
 * shelf, which still shows games we own, so it can't read as their caption.
 */
export default function Hero({ want = false }: { want?: boolean }) {
  const { shortest, longest } = collectionSpan(GAMES);
  const shelf = SHELF.flatMap((slug) => GAMES.filter((g) => g.slug === slug));

  return (
    <header className="hero">
      <ThemeToggle />
      <h1>Our <em>Game</em> Room</h1>
      <p className="hero-sub">
        {want
          ? 'Help us pick our next game from the wishlist below.'
          : `${GAMES.length} games, ${shortest} to ${longest}. What fits tonight?`}
      </p>
      <ul className="hero-shelf" aria-label="Rulebooks">
        {shelf.map((g) => (
          <li key={g.slug}>
            <Link to={rulebookPath(g.slug)} state={FROM_LIST} aria-label={`${g.name} rules`} title={g.name}>
              <img src={g.img} alt="" width={120} height={120} />
            </Link>
          </li>
        ))}
      </ul>
    </header>
  );
}
