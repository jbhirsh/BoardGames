import { describe, it, expect } from 'vitest';
import { fittingSubgames, shownKind, subgameLabel, subgameNoun, subgameTitle } from '../utils/subgames';
import { isDeck } from '../utils/filterGames';
import { initialFilterState } from '../data/initialFilterState';
import { addonGame, presidentSub, speedSub } from './testData';
import type { FilterState } from '../data/types';

const state = (over: Partial<FilterState> = {}): FilterState => ({ ...initialFilterState, ...over });
const deck = [speedSub, presidentSub];
const addons = addonGame.subgames!;

describe('isDeck', () => {
  it('is a deck only when every game inside is a card game', () => {
    expect(isDeck(deck)).toBe(true);
    expect(isDeck([...deck, ...addons])).toBe(false);
    expect(isDeck([])).toBe(false);
    expect(isDeck()).toBe(false);
  });
});

describe('subgameNoun and subgameTitle', () => {
  const extension = { ...addons[0], slug: 'more-seats', name: 'More Seats', kind: 'extension' as const };
  const version = { ...addons[0], slug: 'europe', name: 'Europe', kind: 'version' as const };

  it('names a deck\'s games as games, singular for one', () => {
    expect(subgameNoun(deck, 2)).toBe('games');
    expect(subgameNoun(deck, 1)).toBe('game');
    expect(subgameTitle(deck)).toBe('Games in this deck');
  });

  it('names games of one kind by that kind', () => {
    expect(subgameNoun(addons, 1)).toBe('expansion');
    expect(subgameNoun(addons, 3)).toBe('expansions');
    expect(subgameTitle(addons)).toBe('Expansions');
    expect(subgameNoun([extension], 1)).toBe('extension');
    expect(subgameTitle([extension])).toBe('Extensions');
    expect(subgameNoun([version, version], 2)).toBe('versions');
    expect(subgameTitle([version])).toBe('Versions');
  });

  it('names a mix of kinds as add-ons', () => {
    expect(subgameNoun([extension, ...addons], 2)).toBe('add-ons');
    expect(subgameNoun([version, ...addons], 1)).toBe('add-on');
    expect(subgameTitle([version, ...addons])).toBe('Add-ons');
    expect(subgameNoun([], 0)).toBe('add-ons');
  });
});

describe('shownKind', () => {
  it('tags add-ons by kind, but not card games or names that already say it', () => {
    expect(shownKind('Cities & Knights', 'expansion')).toBe('expansion');
    expect(shownKind('Big Box', 'extension')).toBe('extension');
    expect(shownKind('5–6 Player Extension', 'extension')).toBeNull();
    expect(shownKind('The Expansion Pack', 'expansion')).toBeNull();
    expect(shownKind('Euchre', 'card-game')).toBeNull();
    expect(shownKind('Europe', 'version')).toBe('version');
  });
});

describe('fittingSubgames', () => {
  it('keeps every game, in order, with no players or time chosen', () => {
    expect(fittingSubgames(deck, state({ search: 'x' }))).toEqual([speedSub, presidentSub]);
  });

  it('keeps only the games that fit the players and time', () => {
    expect(fittingSubgames(deck, state({ players: 5 }))).toEqual([presidentSub]);
    expect(fittingSubgames(deck, state({ duration: 'quick' }))).toEqual([speedSub]);
    expect(fittingSubgames(deck, state({ players: 9 }))).toEqual([]);
  });
});

describe('subgameLabel', () => {
  it('counts the games inside, or how many fit once players or time is chosen', () => {
    expect(subgameLabel(deck, state())).toBe('+2 games');
    expect(subgameLabel(addons, state())).toBe('+1 expansion');
    expect(subgameLabel(deck, state({ players: 2 }))).toBe('1 of 2 games fit');
    expect(subgameLabel(deck, state({ players: 9 }))).toBe('0 of 2 games fit');
    expect(subgameLabel(addons, state({ duration: 'long' }))).toBe('1 of 1 expansion fit');
  });
});
