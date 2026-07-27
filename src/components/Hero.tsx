import { GAMES } from '../data/games';
import { collectionSpan } from '../utils/collectionStats';
import RandomPicker from './RandomPicker';

export default function Hero() {
  const { shortest, longest } = collectionSpan(GAMES);

  return (
    <header className="hero">
      <h1>Our <em>Game</em> Room</h1>
      <p className="hero-sub">
        {GAMES.length} games, {shortest} to {longest}. What fits tonight?
      </p>
      <div className="hero-actions">
        <RandomPicker />
        <a className="hero-browse" href="#collection">Browse all {GAMES.length}</a>
      </div>
    </header>
  );
}
