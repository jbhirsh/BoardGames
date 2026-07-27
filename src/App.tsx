import './App.css';
import { useRef } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { FilterProvider } from './context/FilterContext';
import { useStickyOffset } from './hooks/useStickyOffset';
import Hero from './components/Hero';
import FilterBar from './components/FilterBar/FilterBar';
import ActiveTags from './components/ActiveTags';
import GameCollection from './components/GameCollection';
import Wishlist from './components/Wishlist';
import { Analytics } from '@vercel/analytics/react';

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
        <GameCollection />
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
