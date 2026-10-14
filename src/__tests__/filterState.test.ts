import { describe, it, expect } from 'vitest';
import { anyFilterOn, clearFilters, FILTER_FIELDS, filterOn, sortAllowed, withFilters } from '../utils/filterState';
import { initialFilterState } from '../data/initialFilterState';
import type { CollectionMode, FilterState, SortMode } from '../data/types';

const at = (patch: Partial<FilterState>): FilterState => ({ ...initialFilterState, ...patch });
const everyOn = at({ duration: 30, players: 3, keywords: new Set(['word'] as const), search: 'cat' });

describe('filterOn', () => {
  it('is off for every filter at the start', () => {
    for (const f of FILTER_FIELDS) expect(filterOn(initialFilterState, f)).toBe(false);
    expect(anyFilterOn(initialFilterState, FILTER_FIELDS)).toBe(false);
  });

  it('is on for a filter set to anything else', () => {
    for (const f of FILTER_FIELDS) expect(filterOn(everyOn, f)).toBe(true);
    // A blank search is still something typed, which the box and the link keep.
    expect(filterOn(at({ search: ' ' }), 'search')).toBe(true);
  });

  it('is not moved by the sort, view, list or keyword mode', () => {
    const state = at({ sort: 'votes', baseSort: 'votes', view: 'grid', collection: 'want', keywordMode: 'and' });
    expect(anyFilterOn(state, FILTER_FIELDS)).toBe(false);
  });

  it('asks only about the filters named', () => {
    expect(anyFilterOn(at({ search: 'x' }), ['players', 'duration'])).toBe(false);
    expect(anyFilterOn(at({ players: 2 }), ['players', 'duration'])).toBe(true);
  });
});

describe('withFilters and clearFilters', () => {
  it('sets the filters given and keeps everything else', () => {
    const start = at({ sort: 'dur-asc', baseSort: 'group', view: 'grid', collection: 'want' });
    expect(withFilters(start, { players: 5 })).toEqual({ ...start, players: 5 });
    expect(withFilters(start, {})).toEqual(start);
  });

  it('turns off every filter, or the ones named', () => {
    const start = { ...everyOn, keywordMode: 'and' as const, view: 'grid' as const };
    expect(clearFilters(start)).toEqual({ ...start, duration: 'all', players: 0, keywords: new Set(), search: '' });
    expect(clearFilters(start, ['search'])).toEqual({ ...start, search: '' });
    // The original is left alone.
    expect(start.keywords.size).toBe(1);
  });
});

describe('sortAllowed', () => {
  const allowed = (sort: SortMode, c: CollectionMode) => sortAllowed(sort, c);

  it('lets only the wishlist sort by votes', () => {
    expect(allowed('votes', 'want')).toBe(true);
    expect(allowed('votes', 'own')).toBe(false);
  });

  it('lets only the collection sort by difficulty', () => {
    expect(allowed('weight-asc', 'own')).toBe(true);
    expect(allowed('weight-desc', 'own')).toBe(true);
    expect(allowed('weight-asc', 'want')).toBe(false);
    expect(allowed('weight-desc', 'want')).toBe(false);
  });

  it('lets both lists use every other sort', () => {
    for (const sort of ['az', 'group', 'quick', 'long', 'name-asc', 'name-desc', 'players-asc', 'dur-desc'] as const) {
      expect(allowed(sort, 'own')).toBe(true);
      expect(allowed(sort, 'want')).toBe(true);
    }
  });
});
