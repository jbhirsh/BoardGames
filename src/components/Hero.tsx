import { GAMES } from '../data/games';
import { WISHLIST } from '../data/wishlist';

export default function Hero() {
  return (
    <header className="hero">
      <div className="hero-eyebrow">The Collection</div>
      <h1>Our <em>Game</em> Room</h1>
      <p className="hero-sub">
        {GAMES.length} games spanning ten minutes to eight hours — find exactly what fits your night.
      </p>
      <div className="hero-stats">
        <div className="hstat">
          <div className="hstat-n">{GAMES.length}</div>
          <div className="hstat-l">Games</div>
        </div>
        <div className="hstat">
          <div className="hstat-n">2–20+</div>
          <div className="hstat-l">Player Range</div>
        </div>
        <div className="hstat">
          <div className="hstat-n">10 min</div>
          <div className="hstat-l">Shortest</div>
        </div>
        <div className="hstat">
          <div className="hstat-n">8 hrs</div>
          <div className="hstat-l">Longest</div>
        </div>
        <div className="hstat">
          <div className="hstat-n">{WISHLIST.length}</div>
          <div className="hstat-l">Wishlist</div>
        </div>
      </div>
    </header>
  );
}
