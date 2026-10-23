// Property tests (fast-check) for the share links: generated states and
// arbitrary query strings rather than hand-picked ones. A failure prints the
// seed and the shrunk counterexample; pass them to fc.assert to replay it.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { filterToSearchParams, searchParamsToFilter } from '../utils/filterUrl';
import { sortAllowed } from '../utils/filterState';
import { initialFilterState } from '../data/initialFilterState';
import { KW, TIME_BUDGETS } from '../data/keywords';
import type { BaseSort, FilterState, KeywordId } from '../data/types';

const KEYWORDS = Object.keys(KW) as KeywordId[];
const SORTS: BaseSort[] = ['az', 'group', 'quick', 'long', 'votes'];

/** Any state the filter bar can reach and a link can carry (no column sort). */
const shareableState: fc.Arbitrary<FilterState> = fc
  .record({
    duration: fc.constantFrom('all' as const, ...TIME_BUDGETS),
    players: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 99 })),
    keywords: fc.uniqueArray(fc.constantFrom(...KEYWORDS)).map((ids) => new Set(ids)),
    keywordMode: fc.constantFrom('and' as const, 'or' as const),
    search: fc.string(),
    baseSort: fc.constantFrom(...SORTS),
    view: fc.constantFrom('grid' as const, 'list' as const),
    collection: fc.constantFrom('own' as const, 'want' as const),
  })
  .filter((s) => sortAllowed(s.baseSort, s.collection))
  .map((s) => ({ ...s, sort: s.baseSort }));

/** A query string of the link's keys (and others) holding anything at all. */
const anyQuery = fc
  .array(fc.tuple(fc.constantFrom('d', 'p', 'k', 'm', 'q', 's', 'v', 'c', 'x'), fc.string()), { maxLength: 12 })
  .map((pairs) => new URLSearchParams(pairs));

function expectValid(state: FilterState) {
  expect(state.duration === 'all' || TIME_BUDGETS.includes(state.duration)).toBe(true);
  expect(Number.isInteger(state.players) && state.players >= 0 && state.players <= 99).toBe(true);
  for (const kw of state.keywords) expect(KEYWORDS).toContain(kw);
  expect(['and', 'or']).toContain(state.keywordMode);
  expect(SORTS).toContain(state.baseSort);
  expect(state.sort).toBe(state.baseSort);
  expect(sortAllowed(state.baseSort, state.collection)).toBe(true);
  expect(['grid', 'list']).toContain(state.view);
  expect(['own', 'want']).toContain(state.collection);
}

describe('share links (properties)', () => {
  it('open exactly the view they were made from', () => {
    fc.assert(
      fc.property(shareableState, (state) => {
        const params = new URLSearchParams(filterToSearchParams(state).toString());
        expect(searchParamsToFilter(params)).toEqual(state);
      }),
    );
  });

  it('turn any query string into a state the filter bar can show, without throwing', () => {
    fc.assert(fc.property(anyQuery, (params) => expectValid(searchParamsToFilter(params))));
  });

  it('read back the same after one trip through a link', () => {
    fc.assert(
      fc.property(anyQuery, (params) => {
        const once = searchParamsToFilter(params);
        expect(searchParamsToFilter(filterToSearchParams(once))).toEqual(once);
      }),
    );
  });

  it('write only what differs from a bare link', () => {
    fc.assert(
      fc.property(shareableState, (state) => {
        const written = [...filterToSearchParams(state).keys()];
        const bare = searchParamsToFilter(new URLSearchParams());
        expect(bare).toEqual(initialFilterState);
        if (state.view === bare.view) expect(written).not.toContain('v');
        if (state.collection === bare.collection) expect(written).not.toContain('c');
        if (state.baseSort === bare.baseSort) expect(written).not.toContain('s');
        if (state.keywordMode === bare.keywordMode) expect(written).not.toContain('m');
        if (state.keywords.size === 0) expect(written).not.toContain('k');
      }),
    );
  });
});
