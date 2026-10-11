import type { FilterState, Filterable } from '../data/types';

/** What "Pick for us" draws from, and whether games tagged adult were taken out of it. */
export interface PickPool<T> {
  games: readonly T[];
  adultLeftOut: boolean;
}

/**
 * The filtered list "Pick for us" draws from. The picker announces its game
 * in big type to whoever is in the room, so games tagged adult stay out of
 * it unless the Adult keyword is selected. `adultLeftOut` is true only when
 * that took a game out, so the note it puts on the "Fits …" line is never
 * said of a list that had none. A list of nothing but adult games (a search
 * that named one) is left whole: the filters asked for them, and an empty
 * draw would leave the button with nothing to pick.
 */
export function pickPool<T extends Pick<Filterable, 'kw'>>(games: readonly T[], state: FilterState): PickPool<T> {
  if (state.keywords.has('adult')) return { games, adultLeftOut: false };
  const kept = games.filter((g) => !g.kw.includes('adult'));
  if (kept.length === 0 || kept.length === games.length) return { games, adultLeftOut: false };
  return { games: kept, adultLeftOut: true };
}
