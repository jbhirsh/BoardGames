import type { FilterState, Game, SubGame } from '../data/types';
import { fitsTable, isDeck, tableFiltered } from './filterGames';
import { fittingSubgames } from './subgames';

/** What "Pick for us" offers: a game, and the game inside it to play when that's what fits. */
export interface Pick {
  game: Game;
  sub?: SubGame;
}

/**
 * Turns a picked game into something playable. A deck is never played on
 * its own, so it always lands on one of its games that fits. A game that fits
 * the filters only through an add-on (Catan at five players) names that
 * add-on. Anything else is the game itself.
 */
export function resolvePick(game: Game, state: FilterState, random: () => number = Math.random): Pick {
  const subs = game.subgames ?? [];
  if (subs.length === 0) return { game };
  const fitting = fittingSubgames(subs, state);
  // A search that named games inside this one ("Euchre", "Seafarers") picks among those.
  const q = state.search.toLowerCase().trim();
  const named = q ? fitting.filter((s) => s.name.toLowerCase().includes(q)) : [];
  if (named.length > 0) return { game, sub: named[Math.floor(random() * named.length)] };
  if (!isDeck(subs) && (!tableFiltered(state) || fitsTable(game, state))) return { game };
  if (fitting.length === 0) return { game };
  return { game, sub: fitting[Math.floor(random() * fitting.length)] };
}

/**
 * A pick from `pool` that hasn't come up yet this session, so "Pick again"
 * works through the list before repeating. `seen` holds what has come up;
 * once everything has, it starts over (and the caller should clear it).
 */
export function pickFresh<T>(pool: readonly T[], seen: ReadonlySet<T>, random: () => number = Math.random): T {
  if (pool.length === 0) throw new Error('pool empty');
  const fresh = pool.filter((x) => !seen.has(x));
  const from = fresh.length > 0 ? fresh : pool;
  return from[Math.floor(random() * from.length)];
}
