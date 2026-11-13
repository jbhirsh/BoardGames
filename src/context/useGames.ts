import { useContext } from 'react';
import { GamesContext, type GamesData } from './gamesContextValue';

/** The games query's answer: the wishlist, and the collection with BoardGameGeek's data (GamesProvider). */
export function useGames(): GamesData {
  return useContext(GamesContext);
}
