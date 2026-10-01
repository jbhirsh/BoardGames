import type { FilterState, SubGame, SubGameKind } from '../data/types';
import { fitsTable, isDeck, tableFiltered } from './filterGames';

/**
 * What the games inside a game are: "game(s)" for a deck's card games, the
 * kind when they all share one ("expansion(s)", "version(s)"), "add-on(s)"
 * when they mix.
 */
export function subgameNoun(subs: SubGame[], count: number): string {
  const word = isDeck(subs) ? 'game' : sharedKind(subs) ?? 'add-on';
  return count === 1 ? word : `${word}s`;
}

function sharedKind(subs: SubGame[]): SubGameKind | null {
  return subs.length > 0 && subs.every((s) => s.kind === subs[0].kind) ? subs[0].kind : null;
}

/**
 * The kind to tag a game inside another with, or null: a deck's card games
 * need no tag, and "5–6 Player Extension" already says what it is.
 */
export function shownKind(name: string, kind: SubGameKind): Exclude<SubGameKind, 'card-game'> | null {
  if (kind === 'card-game' || name.toLowerCase().includes(kind)) return null;
  return kind;
}

/** What a list of games inside a game is called. */
export function subgameTitle(subs: SubGame[]): string {
  if (isDeck(subs)) return 'Games in this deck';
  const plural = subgameNoun(subs, 2);
  return plural[0].toUpperCase() + plural.slice(1);
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
