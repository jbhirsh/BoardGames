import './App.css';
import { useRef } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { FilterProvider } from './context/FilterContext';
import { WishlistProvider } from './context/WishlistContext';
import { AuthProvider } from './context/AuthContext';
import { useStickyOffset } from './hooks/useStickyOffset';
import { useFilterLayout } from './context/useFilter';
import { useIsPhone } from './hooks/useIsPhone';
import Hero from './components/Hero';
import FilterBar from './components/FilterBar/FilterBar';
import ActiveTags from './components/ActiveTags';
import GameCollection from './components/GameCollection';
import Wishlist from './components/Wishlist';
import PhoneNav from './components/PhoneNav';
import InstantRouteScroll from './components/InstantRouteScroll';
import { Analytics } from '@vercel/analytics/react';
import { withoutToken } from './utils/emailedLinks';

export function HomePage() {
  // Measured here, not inside FilterBar, so ActiveTags counts toward the offset.
  const stickyRef = useRef<HTMLDivElement>(null);
  useStickyOffset(stickyRef);
  // Only the Own/Want choice, so a filter change doesn't redraw the page.
  const { collection } = useFilterLayout();
  // On a phone the active tags repeat what the Filters button counts, so
  // they scroll away with the page rather than taking a sticky row.
  const isPhone = useIsPhone();

  // Both sections stay mounted and the Own/Want toggle (on a phone, the
  // bar along the bottom) hides one, so a toggle never refetches. The
  // session check lives here rather than in App: only this page and
  // /sign-in read it.
  return (
    <AuthProvider>
      <WishlistProvider>
        <title>The Game Room</title>
        <div className="clip-wrap">
          <Hero want={collection === 'want'} />
          <div className="sticky-header" ref={stickyRef} data-sticky-header>
            <FilterBar />
            {!isPhone && <ActiveTags />}
          </div>
          {isPhone && <ActiveTags />}
          <main className="main">
            <GameCollection hidden={collection !== 'own'} />
            <Wishlist hidden={collection !== 'want'} />
          </main>
          {/* Last, so its sticky bottom holds it on screen down the page. */}
          {isPhone && <PhoneNav />}
        </div>
      </WishlistProvider>
    </AuthProvider>
  );
}

/**
 * The layout shell around every page: the filter store (FilterProvider,
 * mirrored to the URL so a view can be shared and Back restores it), scroll
 * restoration with smooth scrolling held off while the router moves the
 * page (InstantRouteScroll, which must come just before ScrollRestoration),
 * and Vercel Analytics, which never records an emailed link's token.
 */
export default function App() {
  return (
    <FilterProvider>
      <InstantRouteScroll />
      <ScrollRestoration />
      <Outlet />
      <Analytics beforeSend={(event) => ({ ...event, url: withoutToken(event.url) })} />
    </FilterProvider>
  );
}
