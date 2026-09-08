import './App.css';
import { useRef } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { FilterProvider } from './context/FilterContext';
import { OwnersProvider } from './context/OwnersContext';
import { GAMES } from './data/games';
import { WISHLIST } from './data/wishlist';
import { useStickyOffset } from './hooks/useStickyOffset';
import Hero from './components/Hero';
import FilterBar from './components/FilterBar/FilterBar';
import ActiveTags from './components/ActiveTags';
import GameCollection from './components/GameCollection';
import Wishlist from './components/Wishlist';
import { Analytics } from '@vercel/analytics/react';

// Every card on the home page shows who owns it; one fetch covers them all.
const OWNABLE_IDS = [...GAMES.map((g) => g.slug), ...WISHLIST.map((w) => w.id)];

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
        <OwnersProvider ids={OWNABLE_IDS}>
          <GameCollection />
          <Wishlist />
        </OwnersProvider>
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
