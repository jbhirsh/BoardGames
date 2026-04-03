import './App.css';
import { FilterProvider } from './context/FilterContext';
import Hero from './components/Hero';
import FilterBar from './components/FilterBar/FilterBar';
import ActiveTags from './components/ActiveTags';
import GameCollection from './components/GameCollection';
import Wishlist from './components/Wishlist';
import { Analytics } from '@vercel/analytics/react';

export default function App() {
  return (
    <FilterProvider>
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
      <Analytics />
    </FilterProvider>
  );
}
