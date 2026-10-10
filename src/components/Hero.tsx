import { Link } from 'react-router';
import { GAMES } from '../data/games';
import { collectionSpan } from '../utils/collectionStats';
import { rulebookPath } from '../utils/rulebooks';
import ThemeToggle from './ThemeToggle';
import { FROM_LIST } from '../utils/fromList';

// A shelf of favourite boxes. Each opens its rulebook, so the row is a way
// in rather than decoration.
const SHELF = ['catan', 'azul', '7-wonders', 'codenames', 'pandemic', 'ticket-to-ride', 'dominion'];

export default function Hero() {
  const { shortest, longest } = collectionSpan(GAMES);
  const shelf = SHELF.flatMap((slug) => GAMES.filter((g) => g.slug === slug));

  return (
    <header className="hero">
      <ThemeToggle />
      <h1>Our <em>Game</em> Room</h1>
      <p className="hero-sub">
        {GAMES.length} games, {shortest} to {longest}. What fits tonight?
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
