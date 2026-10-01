import type { FilterState, SubGame, SubGameKind } from '../data/types';
import { fitsTable, isDeck, tableFiltered } from './filterGames';

/** "game"/"games" for a deck's card games, "add-on"/"add-ons" for anything else. */
export function subgameNoun(subs: SubGame[], count: number): string {
  const word = isDeck(subs) ? 'game' : 'add-on';
  return count === 1 ? word : `${word}s`;
}

/**
 * The kind to tag a game inside another with, or null: a deck's card games
 * need no tag, and "5–6 Player Extension" already says what it is.
 */
export function shownKind(name: string, kind: SubGameKind): 'expansion' | 'extension' | null {
  if (kind === 'card-game' || name.toLowerCase().includes(kind)) return null;
  return kind;
}

/** What a list of games inside a game is called. */
export function subgameTitle(subs: SubGame[]): string {
  return isDeck(subs) ? 'Games in this deck' : 'Add-ons';
}

/**
 * The games inside a game that fit the players and time filters, in the
 * data's order; with neither filter on, all of them.
 */
export function fittingSubgames(subs: SubGame[], state: FilterState): SubGame[] {
  return tableFiltered(state) ? subs.filter((s) => fitsTable(s, state)) : subs;
}

/** What the card's button says: how many games are inside, or how many fit. */
export function subgameLabel(subs: SubGame[], state: FilterState): string {
  if (!tableFiltered(state)) return `+${subs.length} ${subgameNoun(subs, subs.length)}`;
  const fit = fittingSubgames(subs, state).length;
  return `${fit} of ${subs.length} ${subgameNoun(subs, subs.length)} fit`;
}
