import { describe, it, expect } from 'vitest';
import { filterReducer, initialFilterState } from '../context/filterReducer';
import type { FilterState } from '../data/types';

describe('filterReducer', () => {
  it('returns initial state', () => {
    expect(initialFilterState.duration).toBe('all');
    expect(initialFilterState.players).toBe(0);
    expect(initialFilterState.keywords.size).toBe(0);
    expect(initialFilterState.search).toBe('');
    expect(initialFilterState.sort).toBe('az');
    expect(initialFilterState.view).toBe('list');
  });

  it('SET_DURATION updates duration', () => {
    const state = filterReducer(initialFilterState, { type: 'SET_DURATION', payload: 'quick' });
    expect(state.duration).toBe('quick');
  });

  it('SET_PLAYERS updates players', () => {
    const state = filterReducer(initialFilterState, { type: 'SET_PLAYERS', payload: 4 });
    expect(state.players).toBe(4);
  });

  it('TOGGLE_KEYWORD adds a keyword', () => {
    const state = filterReducer(initialFilterState, { type: 'TOGGLE_KEYWORD', payload: 'strategy' });
    expect(state.keywords.has('strategy')).toBe(true);
    expect(state.keywords.size).toBe(1);
  });

  it('TOGGLE_KEYWORD removes an existing keyword', () => {
    const withKeyword: FilterState = {
      ...initialFilterState,
      keywords: new Set(['strategy'] as const),
    };
    const state = filterReducer(withKeyword, { type: 'TOGGLE_KEYWORD', payload: 'strategy' });
    expect(state.keywords.has('strategy')).toBe(false);
    expect(state.keywords.size).toBe(0);
  });

  it('CLEAR_KEYWORDS removes all keywords', () => {
    const withKeywords: FilterState = {
      ...initialFilterState,
      keywords: new Set(['strategy', 'family'] as const),
    };
    const state = filterReducer(withKeywords, { type: 'CLEAR_KEYWORDS' });
    expect(state.keywords.size).toBe(0);
  });

  it('SET_SEARCH updates search', () => {
    const state = filterReducer(initialFilterState, { type: 'SET_SEARCH', payload: 'catan' });
    expect(state.search).toBe('catan');
  });

  it('SET_SORT updates sort and baseSort', () => {
    const state = filterReducer(initialFilterState, { type: 'SET_SORT', payload: 'group' });
    expect(state.sort).toBe('group');
    expect(state.baseSort).toBe('group');
  });

  it('SET_COLUMN_SORT toggles between asc and desc', () => {
    const state1 = filterReducer(initialFilterState, { type: 'SET_COLUMN_SORT', payload: 'name' });
    expect(state1.sort).toBe('name-asc');

    const state2 = filterReducer(state1, { type: 'SET_COLUMN_SORT', payload: 'name' });
    expect(state2.sort).toBe('name-desc');
  });

  it('SET_VIEW updates view', () => {
    const state = filterReducer(initialFilterState, { type: 'SET_VIEW', payload: 'grid' });
    expect(state.view).toBe('grid');
  });

  it('CLEAR_ALL resets to initial but preserves view and baseSort', () => {
    const modified: FilterState = {
      duration: 'quick',
      players: 4,
      keywords: new Set(['strategy'] as const),
      keywordMode: 'and',
      search: 'test',
      sort: 'name-asc',
      baseSort: 'group',
      view: 'grid',
    };
    const state = filterReducer(modified, { type: 'CLEAR_ALL' });
    expect(state.duration).toBe('all');
    expect(state.players).toBe(0);
    expect(state.keywords.size).toBe(0);
    expect(state.search).toBe('');
    expect(state.sort).toBe('group'); // restored from baseSort
    expect(state.baseSort).toBe('group');
    expect(state.view).toBe('grid'); // preserved
  });
});
