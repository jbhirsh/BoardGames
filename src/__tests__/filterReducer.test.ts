import { describe, it, expect } from 'vitest';
import { filterReducer } from '../context/filterReducer';
import { initialFilterState } from '../data/initialFilterState';
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
    const state = filterReducer(initialFilterState, { type: 'SET_DURATION', payload: 30 });
    expect(state.duration).toBe(30);
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

  it('CLEAR_FILTERS on keywords removes all keywords', () => {
    const withKeywords: FilterState = {
      ...initialFilterState,
      keywords: new Set(['strategy', 'family'] as const),
    };
    const state = filterReducer(withKeywords, { type: 'CLEAR_FILTERS', payload: ['keywords'] });
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

  it('keeps a column sort across the Own/Want toggle, since both tables show it', () => {
    const sorted = filterReducer(initialFilterState, { type: 'SET_COLUMN_SORT', payload: 'dur' });
    const want = filterReducer(sorted, { type: 'SET_COLLECTION', payload: 'want' });
    expect(want.sort).toBe(sorted.sort);
    expect(want.baseSort).toBe(sorted.baseSort);
  });

  it('SET_COLLECTION switches between the owned games and the wishlist', () => {
    expect(initialFilterState.collection).toBe('own');
    const want = filterReducer(initialFilterState, { type: 'SET_COLLECTION', payload: 'want' });
    expect(want.collection).toBe('want');
    expect(filterReducer(want, { type: 'SET_COLLECTION', payload: 'own' }).collection).toBe('own');
  });

  it('leaving the wishlist on its vote sort goes back to the default order', () => {
    const want = filterReducer(initialFilterState, { type: 'SET_COLLECTION', payload: 'want' });
    const byVotes = filterReducer(want, { type: 'SET_SORT', payload: 'votes' });
    const own = filterReducer(byVotes, { type: 'SET_COLLECTION', payload: 'own' });
    expect(own.collection).toBe('own');
    expect(own.sort).toBe(initialFilterState.sort);
    expect(own.baseSort).toBe(initialFilterState.sort);
    // Any other sort comes along.
    const quick = filterReducer(want, { type: 'SET_SORT', payload: 'quick' });
    expect(filterReducer(quick, { type: 'SET_COLLECTION', payload: 'own' }).baseSort).toBe('quick');
    // A column sort on top of the vote sort comes along, as it does for any sort.
    const byColumn = filterReducer(byVotes, { type: 'SET_COLUMN_SORT', payload: 'name' });
    const ownByColumn = filterReducer(byColumn, { type: 'SET_COLLECTION', payload: 'own' });
    expect(ownByColumn.sort).toBe('name-asc');
    expect(ownByColumn.baseSort).toBe(initialFilterState.sort);
    // Staying on the wishlist keeps it.
    expect(filterReducer(byVotes, { type: 'SET_COLLECTION', payload: 'want' }).sort).toBe('votes');
  });

  it('drops a difficulty sort on the way to the wishlist, which has no difficulty', () => {
    const byWeight = filterReducer(
      { ...initialFilterState, baseSort: 'group', sort: 'group' },
      { type: 'SET_COLUMN_SORT', payload: 'weight' },
    );
    expect(byWeight.sort).toBe('weight-asc');
    const want = filterReducer(byWeight, { type: 'SET_COLLECTION', payload: 'want' });
    expect(want.collection).toBe('want');
    expect(want.sort).toBe('group');
    // Staying with the collection keeps it.
    expect(filterReducer(byWeight, { type: 'SET_COLLECTION', payload: 'own' }).sort).toBe('weight-asc');
    // Any other column sort comes along.
    const byName = filterReducer(initialFilterState, { type: 'SET_COLUMN_SORT', payload: 'name' });
    expect(filterReducer(byName, { type: 'SET_COLLECTION', payload: 'want' }).sort).toBe('name-asc');
  });

  it('HYDRATE replaces the state with the payload verbatim', () => {
    const payload: FilterState = {
      duration: 60,
      players: 6,
      keywords: new Set(['strategy', 'thematic'] as const),
      keywordMode: 'and',
      search: 'epic',
      sort: 'group',
      baseSort: 'group',
      view: 'grid',
      collection: 'want',
    };
    const next = filterReducer(initialFilterState, { type: 'HYDRATE', payload });
    expect(next).toBe(payload);
    expect(next.duration).toBe(60);
    expect(next.players).toBe(6);
    expect(next.keywords.has('strategy')).toBe(true);
    expect(next.search).toBe('epic');
    expect(next.view).toBe('grid');
  });

  it('CLEAR_ALL resets to initial but preserves view and baseSort', () => {
    const modified: FilterState = {
      duration: 15,
      players: 4,
      keywords: new Set(['strategy'] as const),
      keywordMode: 'and',
      search: 'test',
      sort: 'name-asc',
      baseSort: 'group',
      view: 'grid',
      collection: 'want',
    };
    const state = filterReducer(modified, { type: 'CLEAR_ALL' });
    expect(state.collection).toBe('want');
    expect(state.duration).toBe('all');
    expect(state.players).toBe(0);
    expect(state.keywords.size).toBe(0);
    expect(state.search).toBe('');
    expect(state.sort).toBe('group'); // restored from baseSort
    expect(state.baseSort).toBe('group');
    expect(state.view).toBe('grid'); // preserved
  });
  it('SET_FILTERS sets the filters it is given and leaves the rest', () => {
    const start: FilterState = {
      ...initialFilterState,
      duration: 30,
      players: 4,
      sort: 'name-desc',
      baseSort: 'group',
      view: 'grid',
    };
    const state = filterReducer(start, { type: 'SET_FILTERS', payload: { players: 0, search: 'azul' } });
    expect(state).toEqual({ ...start, players: 0, search: 'azul' });
  });

  it('SET_FILTERS takes only the filters from a whole state, as NoResults hands it one', () => {
    const start: FilterState = { ...initialFilterState, duration: 30, view: 'grid', collection: 'want' };
    const other: FilterState = {
      ...initialFilterState,
      duration: 'all',
      search: 'x',
      view: 'list',
      sort: 'quick',
      baseSort: 'quick',
    };
    const state = filterReducer(start, { type: 'SET_FILTERS', payload: other });
    expect(state).toEqual({ ...start, duration: 'all', search: 'x' });
  });

  it('CLEAR_FILTERS turns off the filters named, and every one with none named', () => {
    const start: FilterState = {
      ...initialFilterState,
      duration: 15,
      players: 4,
      keywords: new Set(['party'] as const),
      keywordMode: 'and',
      search: 'cat',
      sort: 'players-asc',
      baseSort: 'long',
      view: 'grid',
      collection: 'want',
    };
    const sheet = filterReducer(start, { type: 'CLEAR_FILTERS', payload: ['duration', 'players', 'keywords'] });
    expect(sheet).toEqual({ ...start, duration: 'all', players: 0, keywords: new Set(), search: 'cat' });
    // Unlike CLEAR_ALL, the keyword mode and the column sort stay.
    const all = filterReducer(start, { type: 'CLEAR_FILTERS' });
    expect(all).toEqual({ ...start, duration: 'all', players: 0, keywords: new Set(), search: '' });
  });

  it('CLEAR_ALL leaves nothing of the old state but the view, the list and the sorts', () => {
    const modified: FilterState = {
      duration: 15,
      players: 4,
      keywords: new Set(['strategy'] as const),
      keywordMode: 'and',
      search: 'test',
      sort: 'dur-desc',
      baseSort: 'quick',
      view: 'grid',
      collection: 'want',
    };
    expect(filterReducer(modified, { type: 'CLEAR_ALL' })).toEqual({
      ...initialFilterState,
      sort: 'quick',
      baseSort: 'quick',
      view: 'grid',
      collection: 'want',
    });
  });

  it('SET_COLUMN_SORT starts every column ascending and flips it on a second click', () => {
    for (const col of ['name', 'players', 'dur', 'weight'] as const) {
      const once = filterReducer(initialFilterState, { type: 'SET_COLUMN_SORT', payload: col });
      expect(once.sort).toBe(`${col}-asc`);
      expect(filterReducer(once, { type: 'SET_COLUMN_SORT', payload: col }).sort).toBe(`${col}-desc`);
      // The filter bar's A→Z orders as name-asc does, but is not that column sort.
      expect(once.baseSort).toBe('az');
    }
  });
});
