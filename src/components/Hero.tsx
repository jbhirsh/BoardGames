import { GAMES } from '../data/games';
import type { CollectionMode } from '../data/types';
import { collectionSpan } from '../utils/collectionStats';
import { useFilter } from '../context/useFilter';
import { useWishlistItems } from '../context/useWishlistItems';
import RandomPicker from './RandomPicker';

export default function Hero() {
  const { shortest, longest } = collectionSpan(GAMES);
  const { dispatch } = useFilter();
  // Same list the wishlist header counts: static entries plus approved suggestions.
  const wanted = useWishlistItems().items.length;

  function show(mode: CollectionMode) {
    dispatch({ type: 'SET_COLLECTION', payload: mode });
    // Not a plain fragment jump: that races the URL sync's navigation and
    // lets ScrollRestoration put the page back where it was. Scroll once the
    // chosen section carries the anchor id.
    requestAnimationFrame(() => document.getElementById('collection')?.scrollIntoView());
  }

  return (
    <header className="hero">
      <h1>Our <em>Game</em> Room</h1>
      <p className="hero-sub">
        {GAMES.length} games, {shortest} to {longest}. What fits tonight?
      </p>
      <div className="hero-actions">
        <RandomPicker />
        <a className="hero-browse" href="#collection" onClick={(e) => { e.preventDefault(); show('own'); }}>
          Browse all {GAMES.length}
        </a>
        <a className="hero-browse" href="#collection" onClick={(e) => { e.preventDefault(); show('want'); }}>
          See the {wanted} we want
        </a>
      </div>
    </header>
  );
}
