import './App.css';
import { Outlet, ScrollRestoration } from 'react-router';
import { FilterProvider } from './context/FilterContext';
import Hero from './components/Hero';
import FilterBar from './components/FilterBar/FilterBar';
import ActiveTags from './components/ActiveTags';
import GameCollection from './components/GameCollection';
import Wishlist from './components/Wishlist';
import { Analytics } from '@vercel/analytics/react';

export function HomePage() {
  return (
    <div className="clip-wrap">
      <Hero />
      <div className="sticky-header">
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
