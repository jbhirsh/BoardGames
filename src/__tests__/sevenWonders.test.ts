import { describe, it, expect } from 'vitest';
import { breakdown, ordinal, scienceScore, standings, tieBreaks, treasuryScore } from '../utils/sevenWonders';

const sym = (tablets: number, compasses: number, gears: number) => ({ tablets, compasses, gears });

describe('scienceScore', () => {
  it('squares each symbol and adds 7 per full set', () => {
    expect(scienceScore(sym(0, 0, 0))).toBe(0);
    expect(scienceScore(sym(3, 0, 0))).toBe(9);
    expect(scienceScore(sym(2, 1, 1))).toBe(4 + 1 + 1 + 7);
    expect(scienceScore(sym(2, 2, 2))).toBe(12 + 14);
  });
});

describe('treasuryScore', () => {
  it('gives a point for every three coins', () => {
    expect([0, 2, 3, 5, 6, 10].map(treasuryScore)).toEqual([0, 0, 1, 1, 2, 3]);
  });
});

describe('breakdown', () => {
  it('scores each row of the pad and totals them', () => {
    const rows = breakdown({ military: -2, coins: 7, wonder: 3, civilian: 10, commercial: 4, guilds: 6, symbols: sym(2, 1, 1) });
    expect(rows).toEqual({ military: -2, treasury: 2, wonder: 3, civilian: 10, science: 13, commercial: 4, guilds: 6, total: 36 });
  });
});

describe('standings', () => {
  it('places by total', () => {
    expect(standings([{ total: 30, coins: 0 }, { total: 45, coins: 0 }, { total: 38, coins: 0 }]))
      .toEqual([{ player: 1, place: 1 }, { player: 2, place: 2 }, { player: 0, place: 3 }]);
  });

  it('breaks a tie on points with coins', () => {
    expect(standings([{ total: 40, coins: 2 }, { total: 40, coins: 9 }]))
      .toEqual([{ player: 1, place: 1 }, { player: 0, place: 2 }]);
  });

  it('shares the place when points and coins are both level, and skips the next', () => {
    expect(standings([{ total: 40, coins: 3 }, { total: 40, coins: 3 }, { total: 20, coins: 9 }]))
      .toEqual([{ player: 0, place: 1 }, { player: 1, place: 1 }, { player: 2, place: 3 }]);
  });
});

describe('ordinal', () => {
  it('names places', () => {
    expect([1, 2, 3, 4, 7].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '7th']);
  });
});

describe('tieBreaks', () => {
  const p = (name: string, total: number, coins: number, place: number) => ({ name, total, coins, place });

  it('says nothing when no totals match', () => {
    expect(tieBreaks([p('Ana', 50, 1, 1), p('Ben', 40, 9, 2)])).toEqual([]);
  });

  it('says how coins broke a tie', () => {
    expect(tieBreaks([p('Ana', 40, 9, 1), p('Ben', 40, 2, 2)]))
      .toEqual(['Ana and Ben tie on 40 VP; coins break the tie: Ana 9, Ben 2.']);
  });

  it('says when a tie stands, and names three players in a list', () => {
    expect(tieBreaks([p('Ana', 50, 1, 1), p('Ben', 40, 3, 2), p('Cleo', 40, 3, 2), p('Dev', 40, 3, 2)]))
      .toEqual(['Ben, Cleo and Dev tie on 40 VP and 3 coins, so they share 2nd place.']);
  });

  it('says who still shares a place when coins settle only part of a tie', () => {
    expect(tieBreaks([p('Ana', 40, 5, 1), p('Ben', 40, 5, 1), p('Cleo', 40, 3, 3)]))
      .toEqual(['Ana, Ben and Cleo tie on 40 VP; coins break the tie: Ana 5, Ben 5, Cleo 3. Ana and Ben still share 1st.']);
  });

  it('notes each tied total separately', () => {
    expect(tieBreaks([p('Ana', 50, 4, 1), p('Ben', 50, 2, 2), p('Cleo', 30, 1, 3), p('Dev', 30, 1, 3)])).toHaveLength(2);
  });
});
