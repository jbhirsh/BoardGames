import './App.css';
import { useRef } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { FilterProvider } from './context/FilterContext';
import { OwnersProvider } from './context/OwnersContext';
import { GAMES } from './data/games';
import { useStickyOffset } from './hooks/useStickyOffset';
import Hero from './components/Hero';
import FilterBar from './components/FilterBar/FilterBar';
import ActiveTags from './components/ActiveTags';
import GameCollection from './components/GameCollection';
import Wishlist from './components/Wishlist';
import { Analytics } from '@vercel/analytics/react';

// Collection cards show who owns each game; the wishlist runs its own provider
// because its id set also includes approved friend suggestions.
const COLLECTION_IDS = GAMES.map((g) => g.slug);

export function HomePage() {
  // Measured here, not inside FilterBar, so ActiveTags counts toward the offset.
  const stickyRef = useRef<HTMLDivElement>(null);
  useStickyOffset(stickyRef);

  return (
    <div className="clip-wrap">
      <Hero />
      <div className="sticky-header" ref={stickyRef}>
        <FilterBar />
        <ActiveTags />
      </div>
      <main className="main">
        <OwnersProvider ids={COLLECTION_IDS}>
          <GameCollection />
        </OwnersProvider>
        <Wishlist />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <FilterProvider>
      <ScrollRestoration />
      <Outlet />
      <Analytics />
    </FilterProvider>
  );
}
