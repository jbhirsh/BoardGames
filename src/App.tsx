import './App.css';
import { useRef } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { FilterProvider } from './context/FilterContext';
import { WishlistProvider } from './context/WishlistContext';
import { AuthProvider } from './context/AuthContext';
import { useStickyOffset } from './hooks/useStickyOffset';
import { useFilter } from './context/useFilter';
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
  const { state } = useFilter();

  // Both sections stay mounted and the Own/Want toggle hides one, so a
  // toggle never refetches. The session check lives here rather than in
  // App: only this page and /sign-in read it.
  return (
    <AuthProvider>
      <WishlistProvider>
        <div className="clip-wrap">
          <Hero />
          <div className="sticky-header" ref={stickyRef}>
            <FilterBar />
            <ActiveTags />
          </div>
          <main className="main">
            <GameCollection hidden={state.collection !== 'own'} />
            <Wishlist hidden={state.collection !== 'want'} />
          </main>
        </div>
      </WishlistProvider>
    </AuthProvider>
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
