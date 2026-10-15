import { describe, expect, it } from 'vitest';
import type { KeywordId } from '../data/types';
import { initialFilterState } from '../data/initialFilterState';
import { litKeywords } from '../utils/keywordLit';

describe('litKeywords', () => {
  it('lights a selected keyword', () => {
    const lit = litKeywords({ ...initialFilterState, keywords: new Set<KeywordId>(['bluffing']) });
    expect(lit.has('bluffing')).toBe(true);
    expect(lit.has('strategy')).toBe(false);
  });

  it('lights a keyword whose label the search text names, ignoring case and padding', () => {
    expect(litKeywords({ ...initialFilterState, search: '  BLUFF ' }).has('bluffing')).toBe(true);
    expect(litKeywords({ ...initialFilterState, search: 'bluff' }).has('strategy')).toBe(false);
    expect(litKeywords(initialFilterState).has('bluffing')).toBe(false);
  });

  it('holds every keyword that lights, and no other', () => {
    const state = { ...initialFilterState, keywords: new Set<KeywordId>(['party']), search: 'strat' };
    expect([...litKeywords(state)].sort()).toEqual(['party', 'strategy']);
    expect(litKeywords(initialFilterState).size).toBe(0);
  });
});
