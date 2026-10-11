import { describe, it, expect } from 'vitest';
import { pickPool } from '../utils/pickPool';
import { filterGames } from '../utils/filterGames';
import { relaxations } from '../utils/relaxFilters';
import { GAMES } from '../data/games';
import { TIME_BUDGETS } from '../data/keywords';
import { initialFilterState } from '../data/initialFilterState';
import { quickGame, mediumGame } from './testData';
import type { DurationFilter, FilterState, Game, KeywordId } from '../data/types';

const at = (patch: Partial<FilterState>): FilterState => ({ ...initialFilterState, ...patch });
const withKeywords = (ids: KeywordId[], patch: Partial<FilterState> = {}) => at({ keywords: new Set(ids), ...patch });
const isAdult = (g: Game) => g.kw.includes('adult');
const names = (games: readonly Game[]) => games.map((g) => g.name);

const adultGame: Game = { ...quickGame, name: 'Adult Game', slug: 'adult-game', kw: ['party', 'adult'] };
const adultOnly = [adultGame, { ...adultGame, name: 'Adult Game 2', slug: 'adult-game-2' }];

describe('pickPool', () => {
  it('leaves adult games out when the Adult keyword is not selected, and says so', () => {
    const pool = pickPool([quickGame, adultGame, mediumGame], initialFilterState);
    expect(pool).toEqual({ games: [quickGame, mediumGame], adultLeftOut: true });
  });

  it('keeps them when the Adult keyword is selected, in either keyword mode', () => {
    for (const keywordMode of ['and', 'or'] as const) {
      const list = [quickGame, adultGame, mediumGame];
      const pool = pickPool(list, withKeywords(['adult', 'party'], { keywordMode }));
      expect(pool.games).toBe(list);
      expect(pool.adultLeftOut).toBe(false);
    }
  });

  it('still leaves them out when only other keywords are selected', () => {
    const pool = pickPool([quickGame, adultGame], withKeywords(['party']));
    expect(pool).toEqual({ games: [quickGame], adultLeftOut: true });
  });

  it("says nothing was left out of a list that had no adult games", () => {
    const list = [quickGame, mediumGame];
    const pool = pickPool(list, initialFilterState);
    expect(pool.games).toBe(list);
    expect(pool.adultLeftOut).toBe(false);
  });

  it('keeps a list of nothing but adult games whole rather than emptying it', () => {
    const pool = pickPool(adultOnly, at({ search: 'adult' }));
    expect(pool.games).toBe(adultOnly);
    expect(pool.adultLeftOut).toBe(false);
  });

  it('leaves an empty list empty', () => {
    expect(pickPool([], initialFilterState)).toEqual({ games: [], adultLeftOut: false });
  });
});

describe('pickPool on the collection', () => {
  const adultNames = names(GAMES.filter(isAdult));

  it('leaves every adult game out of an unfiltered pick', () => {
    // Three games are tagged adult (#197); the rest are the draw.
    expect(adultNames).toHaveLength(3);
    const pool = pickPool(filterGames(GAMES, initialFilterState), initialFilterState);
    expect(pool.adultLeftOut).toBe(true);
    expect(pool.games).toHaveLength(GAMES.length - 3);
    expect(pool.games.some(isAdult)).toBe(false);
  });

  it('draws from the adult games alone when the Adult keyword asks for them', () => {
    const state = withKeywords(['adult']);
    const pool = pickPool(filterGames(GAMES, state), state);
    expect(pool.adultLeftOut).toBe(false);
    expect(names(pool.games).sort()).toEqual([...adultNames].sort());
  });

  it('still leaves a large group four games once the adult ones are out', () => {
    // At 11 players and up, seven games fit and three of them are adult
    // (the issue counted six; the data says seven), so the pick never runs dry.
    for (const players of [11, 12, 20, 99]) {
      const state = at({ players });
      const list = filterGames(GAMES, state);
      expect(list).toHaveLength(7);
      expect(list.filter(isAdult)).toHaveLength(3);
      const pool = pickPool(list, state);
      expect(pool.adultLeftOut).toBe(true);
      expect(names(pool.games).sort()).toEqual(['Cranium', 'Far-Out Questions', 'Poetry for Neanderthals', 'Truth or Dare Tower']);
    }
  });

  it('never needs to keep adult games for players and time alone', () => {
    // Whatever the table, a list the players and time filters leave has a
    // game that isn't adult whenever it has any, so the rule always holds.
    const durations: DurationFilter[] = ['all', ...TIME_BUDGETS];
    for (let players = 0; players <= 99; players++) {
      for (const duration of durations) {
        const state = at({ players, duration });
        const list = filterGames(GAMES, state);
        if (list.length === 0) continue;
        const pool = pickPool(list, state);
        expect(pool.games.some(isAdult), `${players} players, ${duration}`).toBe(false);
        expect(pool.adultLeftOut).toBe(list.some(isAdult));
      }
    }
  });

  it('holds through a filter dropped to bring results back', () => {
    // No strategy game seats eleven; each way back to a list still keeps
    // the adult games out of the pick, and says so when it did.
    const state = withKeywords(['strategy'], { players: 11 });
    expect(filterGames(GAMES, state)).toEqual([]);
    const ways = relaxations(state, (s) => filterGames(GAMES, s).length);
    expect(ways.map((w) => w.id).sort()).toEqual(['kw:strategy', 'players']);
    for (const way of ways) {
      const list = filterGames(GAMES, way.without);
      const pool = pickPool(list, way.without);
      expect(pool.games.length).toBeGreaterThan(0);
      expect(pool.games.some(isAdult)).toBe(false);
      expect(pool.adultLeftOut).toBe(list.some(isAdult));
    }
  });

  it('keeps the one adult game a search names', () => {
    const state = at({ search: 'Cards Against' });
    const pool = pickPool(filterGames(GAMES, state), state);
    expect(names(pool.games)).toEqual(['Cards Against Humanity']);
    expect(pool.adultLeftOut).toBe(false);
  });
});
