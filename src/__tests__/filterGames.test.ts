import { describe, it, expect } from 'vitest';
import { filterGames, sortGames } from '../utils/filterGames';
import { initialFilterState } from '../data/initialFilterState';
import { testGames, quickGame, mediumGame, longGame } from './testData';
import type { FilterState } from '../data/types';

function makeState(overrides: Partial<FilterState> = {}): FilterState {
  return { ...initialFilterState, ...overrides };
}

describe('filterGames', () => {
  it('returns all games with default filters', () => {
    const result = filterGames(testGames, makeState());
    expect(result).toHaveLength(3);
  });

  describe('duration filter', () => {
    it('filters quick games by cat', () => {
      const result = filterGames(testGames, makeState({ duration: 'quick' }));
      expect(result).toEqual([quickGame]);
    });

    it('filters medium games by cat', () => {
      const result = filterGames(testGames, makeState({ duration: 'medium' }));
      expect(result).toEqual([mediumGame]);
    });

    it('filters long games by cat', () => {
      const result = filterGames(testGames, makeState({ duration: 'long' }));
      expect(result).toEqual([longGame]);
    });

    // Regression: filtering must follow the curated `cat`, not a re-derivation
    // from `mins`. Cards Against Humanity ships as mins:90, cat:"medium" — the
    // one game where the two disagree. Under mins-bucketing it vanished from
    // its own "medium" filter and wrongly appeared under "long".
    it('follows cat even when mins would fall in a different bucket', () => {
      const mismatched = { ...mediumGame, name: 'Party 90', slug: 'party-90', mins: 90, cat: 'medium' as const };
      const games = [mismatched, longGame];
      expect(filterGames(games, makeState({ duration: 'medium' }))).toEqual([mismatched]);
      expect(filterGames(games, makeState({ duration: 'long' }))).toEqual([longGame]);
    });
  });

  describe('players filter', () => {
    it('filters by player count within range', () => {
      const result = filterGames(testGames, makeState({ players: 2 }));
      expect(result).toHaveLength(2); // quickGame (2-4) and longGame (2-5)
      expect(result.map(g => g.name)).toContain('Quick Game');
      expect(result.map(g => g.name)).toContain('Long Game');
    });

    it('returns no results for impossible player count', () => {
      const result = filterGames(testGames, makeState({ players: 100 }));
      expect(result).toHaveLength(0);
    });

    it('returns all when players is 0', () => {
      const result = filterGames(testGames, makeState({ players: 0 }));
      expect(result).toHaveLength(3);
    });
  });

  describe('keyword filter (AND logic)', () => {
    it('filters by single keyword', () => {
      const result = filterGames(testGames, makeState({ keywords: new Set(['strategy']), keywordMode: 'and' }));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Medium Game');
    });

    it('filters by multiple keywords (AND)', () => {
      const result = filterGames(testGames, makeState({ keywords: new Set(['card-game', 'family']), keywordMode: 'and' }));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Quick Game');
    });

    it('returns empty when no game matches all keywords', () => {
      const result = filterGames(testGames, makeState({ keywords: new Set(['strategy', 'cooperative']), keywordMode: 'and' }));
      expect(result).toHaveLength(0);
    });
  });

  describe('keyword filter (OR logic)', () => {
    it('returns games matching any keyword', () => {
      const result = filterGames(testGames, makeState({ keywords: new Set(['strategy', 'cooperative']), keywordMode: 'or' }));
      expect(result).toHaveLength(2);
    });
  });

  describe('search filter', () => {
    it('searches by name', () => {
      const result = filterGames(testGames, makeState({ search: 'quick' }));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Quick Game');
    });

    it('searches by description', () => {
      const result = filterGames(testGames, makeState({ search: 'epic cooperative' }));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Long Game');
    });

    it('search is case-insensitive', () => {
      const result = filterGames(testGames, makeState({ search: 'MEDIUM' }));
      expect(result).toHaveLength(1);
    });
  });

  describe('combined filters', () => {
    it('applies duration + players together', () => {
      // Quick games playable by 3 people: quickGame (2-4) matches
      const result = filterGames(testGames, makeState({ duration: 'quick', players: 3 }));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Quick Game');
    });

    it('returns empty when filters conflict', () => {
      // Quick games with strategy keyword: none match
      const result = filterGames(testGames, makeState({ duration: 'quick', keywords: new Set(['strategy']) }));
      expect(result).toHaveLength(0);
    });
  });
});

describe('sortGames', () => {
  it('sorts alphabetically (az)', () => {
    const result = sortGames(testGames, 'az');
    expect(result.map(g => g.name)).toEqual(['Long Game', 'Medium Game', 'Quick Game']);
  });

  it('sorts by name descending', () => {
    const result = sortGames(testGames, 'name-desc');
    expect(result.map(g => g.name)).toEqual(['Quick Game', 'Medium Game', 'Long Game']);
  });

  it('sorts quickest first', () => {
    const result = sortGames(testGames, 'quick');
    expect(result.map(g => g.mins)).toEqual([10, 45, 120]);
  });

  it('sorts longest first', () => {
    const result = sortGames(testGames, 'long');
    expect(result.map(g => g.mins)).toEqual([120, 45, 10]);
  });

  it('sorts by group order', () => {
    const result = sortGames(testGames, 'group');
    // GROUP_ORDER: social, word, party, strat, coop
    expect(result.map(g => g.group)).toEqual(['party', 'strat', 'coop']);
  });
});
