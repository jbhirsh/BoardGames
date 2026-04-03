import './App.css';
import { Routes, Route } from 'react-router';
import { FilterProvider } from './context/FilterContext';
import Hero from './components/Hero';
import FilterBar from './components/FilterBar/FilterBar';
import ActiveTags from './components/ActiveTags';
import GameCollection from './components/GameCollection';
import Wishlist from './components/Wishlist';
import RulesPage from './components/RulesPage';
import { Analytics } from '@vercel/analytics/react';

function HomePage() {
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
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/rules/:slug" element={<RulesPage />} />
      </Routes>
      <Analytics />
    </FilterProvider>
  );
}
