import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { COMING_SOON, GAMES } from '../data/games';
import { query } from '../client/graphql';
import { GamesDocument, type GamesQuery } from '../gql/graphql';
import { collectionWithBgg, indexBgg, toWishlistItem } from '../utils/bggInfo';
import { GamesContext } from './gamesContextValue';

/**
 * The games query (Query.games, over GET so the service worker keeps its
 * last answer for offline use), asked once for the whole app and again on
 * `reload()` after the owner changes the wishlist. It gives the wishlist,
 * and the collection, still compiled in (src/data/games.ts), its
 * difficulty, awards and the owner's picked summaries from BoardGameGeek.
 * Until it answers, the collection shows its own lines and nothing of
 * BGG's; a failed answer settles it the same way, with an empty wishlist,
 * and says so (`failed`), so the wishlist can say it didn't load.
 */
export function GamesProvider({ children }: { children: ReactNode }) {
  const [answer, setAnswer] = useState<{ data: GamesQuery['games'] | null; loaded: boolean }>({
    data: null,
    loaded: false,
  });
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(() => setGeneration((g) => g + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    // A reload follows the owner's change, so it waits for the network's
    // answer rather than the service worker's saved one.
    void query(GamesDocument, {}, controller.signal, { fresh: generation > 0 }).then((result) => {
      if (controller.signal.aborted) return;
      // A failed reload keeps what the page already shows.
      setAnswer((last) => ({ data: result.ok ? result.data.games : last.data, loaded: true }));
    });
    return () => controller.abort();
  }, [generation]);

  const value = useMemo(() => {
    const bgg = indexBgg(answer.data?.bgg ?? []);
    return {
      wishlist: (answer.data?.wishlist ?? []).map((g) => toWishlistItem(g, bgg)),
      bgg,
      collection: answer.data ? collectionWithBgg(GAMES, bgg) : GAMES,
      comingSoon: answer.data ? collectionWithBgg(COMING_SOON, bgg) : COMING_SOON,
      loaded: answer.loaded,
      failed: answer.loaded && !answer.data,
      reload,
    };
  }, [answer, reload]);

  return <GamesContext.Provider value={value}>{children}</GamesContext.Provider>;
}
