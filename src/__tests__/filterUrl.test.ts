import { describe, it, expect } from 'vitest';
import {
  filterToSearchParams,
  searchParamsToFilter,
  buildShareUrl,
} from '../utils/filterUrl';
import { initialFilterState } from '../data/initialFilterState';
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

  it('omits active column sort, serialising baseSort instead', () => {
    // sort='name-asc' is a transient column-sort; baseSort is still the
    // default 'az', so the URL should have no `s` at all.
    const params = filterToSearchParams(
      makeState({ sort: 'name-asc', baseSort: 'az' }),
    );
    expect(params.has('s')).toBe(false);
  });

  it('serialises baseSort and ignores sort when they diverge', () => {
    const params = filterToSearchParams(
      makeState({ sort: 'name-asc', baseSort: 'group' }),
    );
    expect(params.get('s')).toBe('group');
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

  it('ignores column-sort values that are never emitted', () => {
    // name-asc / dur-desc etc. are valid SortMode values but internal to
    // list-view column sorting and intentionally never serialised. They
    // must not be accepted on the way back in.
    for (const s of ['name-asc', 'name-desc', 'dur-asc', 'dur-desc', 'players-asc', 'players-desc']) {
      const state = searchParamsToFilter(new URLSearchParams(`s=${s}`));
      expect(state.baseSort).toBe('az');
      expect(state.sort).toBe('az');
    }
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
    // Partial numeric strings: parseInt('5abc', 10) === 5 would silently
    // accept this; Number('5abc') is NaN.
    expect(searchParamsToFilter(new URLSearchParams('p=5abc')).players).toBe(0);
    // Floats must be rejected too.
    expect(searchParamsToFilter(new URLSearchParams('p=5.5')).players).toBe(0);
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

