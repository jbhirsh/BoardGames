import type { ReactNode } from 'react';
import { GamesContext } from '../../context/gamesContextValue';
import { indexBgg } from '../../utils/bggInfo';
import { COLLECTION_BGG, WEIGHED_COMING_SOON, WEIGHED_GAMES, WISHLIST } from './wishlist';

/** The games query's answer already in, with made-up weights for the collection, for a component's own test. */
export function GamesFixture({ children }: { children: ReactNode }) {
  return (
    <GamesContext.Provider
      value={{
        wishlist: WISHLIST,
        bgg: indexBgg(COLLECTION_BGG),
        collection: WEIGHED_GAMES,
        comingSoon: WEIGHED_COMING_SOON,
        loaded: true,
        failed: false,
        reload: () => {},
      }}
    >
      {children}
    </GamesContext.Provider>
  );
}
