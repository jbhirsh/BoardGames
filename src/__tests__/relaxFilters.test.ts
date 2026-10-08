import { describe, it, expect } from 'vitest';
import { activeFilters, relaxations, listFilters } from '../utils/relaxFilters';
import { initialFilterState } from '../data/initialFilterState';
import type { FilterState, KeywordId } from '../data/types';

const at = (patch: Partial<FilterState>): FilterState => ({ ...initialFilterState, ...patch });

describe('activeFilters', () => {
  it('lists nothing when nothing is filtered', () => {
    expect(activeFilters(initialFilterState)).toEqual([]);
  });

  it('names each filter and what the state is without it', () => {
    const state = at({ duration: 15, players: 4, keywords: new Set<KeywordId>(['strategy', 'party']), search: ' azul ' });
    const filters = activeFilters(state);
    expect(filters.map((f) => [f.id, f.label])).toEqual([
      ['duration', 'up to 15 min'],
      ['players', '4 players'],
      ['kw:strategy', 'Strategy'],
      ['kw:party', 'Party'],
      ['search', '“azul”'],
    ]);
    expect(filters[0].without.duration).toBe('all');
    expect(filters[1].without.players).toBe(0);
    expect([...filters[2].without.keywords]).toEqual(['party']);
    expect(filters[4].without.search).toBe('');
    // The original is left alone.
    expect(state.keywords.size).toBe(2);
  });

  it('says "1 player", not "1 players"', () => {
    expect(activeFilters(at({ players: 1 }))[0].label).toBe('1 player');
  });
});

describe('relaxations', () => {
  it('keeps the filters whose removal brings results back, most first', () => {
    const state = at({ duration: 15, players: 4 });
    const counts = (s: FilterState) => (s.duration === 'all' ? 3 : s.players === 0 ? 7 : 0);
    expect(relaxations(state, counts).map((r) => [r.id, r.count])).toEqual([['players', 7], ['duration', 3]]);
  });

  it('is empty when no single filter is to blame', () => {
    expect(relaxations(at({ duration: 15, players: 4 }), () => 0)).toEqual([]);
  });
});

describe('listFilters', () => {
  it('joins labels the way a sentence would', () => {
    const f = (label: string) => ({ id: 'search' as const, label, without: initialFilterState });
    expect(listFilters([])).toBe('');
    expect(listFilters([f('4 players')])).toBe('4 players');
    expect(listFilters([f('4 players'), f('up to 15 min')])).toBe('4 players and up to 15 min');
    expect(listFilters([f('a'), f('b'), f('c')])).toBe('a, b and c');
  });

  it('reads keywords as alternatives in any-keyword mode, and as requirements in all mode', () => {
    const f = (label: string) => ({ id: 'players' as const, label, without: initialFilterState });
    const kw = (label: string) => ({ id: 'kw:party' as const, label, without: initialFilterState });
    const filters = [f('4 players'), kw('Party'), kw('Word')];
    expect(listFilters(filters, 'or')).toBe('4 players and Party or Word');
    expect(listFilters(filters, 'and')).toBe('4 players, Party and Word');
    expect(listFilters([kw('Party')], 'or')).toBe('Party');
    expect(listFilters([f('4 players')], 'or')).toBe('4 players');
  });
});
