import { describe, it, expect } from 'vitest';
import { resolvePick, pickFresh } from '../utils/resolvePick';
import { initialFilterState } from '../data/initialFilterState';
import { mediumGame, deckGame, addonGame, speedSub, presidentSub } from './testData';
import type { FilterState } from '../data/types';

const at = (patch: Partial<FilterState>): FilterState => ({ ...initialFilterState, ...patch });
const first = () => 0;
const last = () => 0.999;

describe('resolvePick', () => {
  it('leaves a game with nothing inside as it is', () => {
    expect(resolvePick(mediumGame, at({ players: 4 }))).toEqual({ game: mediumGame });
  });

  it('always lands a deck on one of its games, even with no filters', () => {
    expect(resolvePick(deckGame, initialFilterState, first)).toEqual({ game: deckGame, sub: speedSub });
    expect(resolvePick(deckGame, initialFilterState, last)).toEqual({ game: deckGame, sub: presidentSub });
  });

  it("picks only among a deck's games that fit", () => {
    // Speed is two players only; President seats four to eight.
    expect(resolvePick(deckGame, at({ players: 6 }), first)).toEqual({ game: deckGame, sub: presidentSub });
  });

  it('names the add-on when the game fits only through it', () => {
    // A base game for three or four whose Big Box seats up to six, the way
    // Catan's 5-6 player extension does.
    const smallBase = { ...addonGame, max: 4 };
    const sub = addonGame.subgames![0];
    expect(resolvePick(smallBase, at({ players: 6 }), first)).toEqual({ game: smallBase, sub });
  });

  it('leaves a game that fits on its own without an add-on', () => {
    expect(resolvePick(addonGame, at({ players: 4 }), first)).toEqual({ game: addonGame });
    expect(resolvePick(addonGame, initialFilterState, first)).toEqual({ game: addonGame });
  });

  it('picks the games inside that a search named', () => {
    expect(resolvePick(deckGame, at({ search: 'presid' }), first)).toEqual({ game: deckGame, sub: presidentSub });
    const sub = addonGame.subgames![0];
    expect(resolvePick(addonGame, at({ search: 'big box' }), first)).toEqual({ game: addonGame, sub });
  });

  it('falls back to the game when none of its games fit', () => {
    expect(resolvePick(deckGame, at({ players: 3, duration: 15 }), first)).toEqual({ game: deckGame });
  });
});

describe('pickFresh', () => {
  it('throws on an empty pool', () => {
    expect(() => pickFresh([], new Set())).toThrow('pool empty');
  });

  it('skips what has come up already', () => {
    expect(pickFresh(['a', 'b', 'c'], new Set(['a', 'b']), first)).toBe('c');
    expect(pickFresh(['a', 'b', 'c'], new Set(['a']), last)).toBe('c');
  });

  it('starts over once everything has come up', () => {
    expect(pickFresh(['a', 'b'], new Set(['a', 'b']), last)).toBe('b');
  });
});
