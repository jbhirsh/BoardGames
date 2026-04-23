import { describe, it, expect } from 'vitest';
import {
  filterToSearchParams,
  searchParamsToFilter,
  buildShareUrl,
  hydrateFilterStateFromLocation,
} from '../utils/filterUrl';
import { initialFilterState } from '../context/filterReducer';
import type { FilterState } from '../data/types';

function makeState(overrides: Partial<FilterState> = {}): FilterState {
  return {
    ...initialFilterState,
    keywords: new Set(initialFilterState.keywords),
    ...overrides,
  };
}

describe('filterToSearchParams', () => {
  it('produces empty params for initial state', () => {
    expect(filterToSearchParams(initialFilterState).toString()).toBe('');
  });

  it('encodes duration, players, and keyword mode', () => {
    const state = makeState({
      duration: 'quick',
      players: 5,
      keywordMode: 'and',
      keywords: new Set(['strategy', 'family']),
    });
    const params = filterToSearchParams(state);
    expect(params.get('d')).toBe('quick');
    expect(params.get('p')).toBe('5');
    expect(params.get('m')).toBe('and');
    expect(params.get('k')).toBe('family,strategy');
  });

  it('encodes search, sort, and view', () => {
    const state = makeState({
      search: 'catan',
      sort: 'group',
      baseSort: 'group',
      view: 'grid',
    });
    const params = filterToSearchParams(state);
    expect(params.get('q')).toBe('catan');
    expect(params.get('s')).toBe('group');
    expect(params.get('v')).toBe('grid');
  });

  it('omits defaults', () => {
    const params = filterToSearchParams(
      makeState({ keywordMode: 'or', view: 'list', baseSort: 'az' }),
    );
    expect(params.has('m')).toBe(false);
    expect(params.has('v')).toBe(false);
    expect(params.has('s')).toBe(false);
  });
});

describe('searchParamsToFilter', () => {
  it('returns initial state for empty params', () => {
    const state = searchParamsToFilter(new URLSearchParams(''));
    expect(state.duration).toBe('all');
    expect(state.players).toBe(0);
    expect(state.keywords.size).toBe(0);
    expect(state.search).toBe('');
    expect(state.baseSort).toBe('az');
    expect(state.view).toBe('list');
  });

  it('parses valid params', () => {
    const state = searchParamsToFilter(
      new URLSearchParams('d=medium&p=4&k=strategy,family&m=and&q=epic&s=group&v=grid'),
    );
    expect(state.duration).toBe('medium');
    expect(state.players).toBe(4);
    expect(state.keywords.has('strategy')).toBe(true);
    expect(state.keywords.has('family')).toBe(true);
    expect(state.keywordMode).toBe('and');
    expect(state.search).toBe('epic');
    expect(state.sort).toBe('group');
    expect(state.baseSort).toBe('group');
    expect(state.view).toBe('grid');
  });

  it('ignores invalid duration, keywords, sort, view, and mode', () => {
    const state = searchParamsToFilter(
      new URLSearchParams('d=forever&k=notakw,strategy,bogus&m=xor&s=chaotic&v=cards'),
    );
    expect(state.duration).toBe('all');
    expect(state.keywords.has('strategy')).toBe(true);
    expect(state.keywords.size).toBe(1);
    expect(state.keywordMode).toBe('or');
    expect(state.baseSort).toBe('az');
    expect(state.view).toBe('list');
  });

  it('ignores non-numeric or out-of-range player counts', () => {
    expect(searchParamsToFilter(new URLSearchParams('p=abc')).players).toBe(0);
    expect(searchParamsToFilter(new URLSearchParams('p=0')).players).toBe(0);
    expect(searchParamsToFilter(new URLSearchParams('p=999')).players).toBe(0);
    expect(searchParamsToFilter(new URLSearchParams('p=-3')).players).toBe(0);
  });
});

describe('roundtrip', () => {
  it('preserves a representative filter state', () => {
    const original = makeState({
      duration: 'medium',
      players: 5,
      keywords: new Set(['strategy', 'team']),
      keywordMode: 'and',
      search: 'quick party',
      sort: 'group',
      baseSort: 'group',
      view: 'grid',
    });
    const params = filterToSearchParams(original);
    const restored = searchParamsToFilter(params);
    expect(restored.duration).toBe(original.duration);
    expect(restored.players).toBe(original.players);
    expect([...restored.keywords].sort()).toEqual([...original.keywords].sort());
    expect(restored.keywordMode).toBe(original.keywordMode);
    expect(restored.search).toBe(original.search);
    expect(restored.baseSort).toBe(original.baseSort);
    expect(restored.view).toBe(original.view);
  });
});

describe('buildShareUrl', () => {
  it('returns origin + "/" when no filters are set', () => {
    expect(buildShareUrl(initialFilterState)).toBe(`${window.location.origin}/`);
  });

  it('appends a query string when filters are set', () => {
    const url = buildShareUrl(makeState({ duration: 'quick', players: 4 }));
    expect(url.startsWith(`${window.location.origin}/?`)).toBe(true);
    expect(url).toContain('d=quick');
    expect(url).toContain('p=4');
  });
});

describe('hydrateFilterStateFromLocation', () => {
  it('reads from window.location.search', () => {
    const prev = window.location.search;
    window.history.replaceState(null, '', '/?d=long&p=2');
    const state = hydrateFilterStateFromLocation();
    expect(state.duration).toBe('long');
    expect(state.players).toBe(2);
    window.history.replaceState(null, '', `/${prev}`);
  });
});
