import { describe, expect, it } from 'vitest';
import type { KeywordId } from '../data/types';
import { initialFilterState } from '../data/initialFilterState';
import { isKeywordLit, litKeywords } from '../utils/keywordLit';

describe('isKeywordLit', () => {
  it('lights a selected keyword', () => {
    const state = { ...initialFilterState, keywords: new Set<KeywordId>(['bluffing']) };
    expect(isKeywordLit(state, 'bluffing')).toBe(true);
    expect(isKeywordLit(state, 'strategy')).toBe(false);
  });

  it('lights a keyword whose label the search text names, ignoring case and padding', () => {
    expect(isKeywordLit({ ...initialFilterState, search: '  BLUFF ' }, 'bluffing')).toBe(true);
    expect(isKeywordLit({ ...initialFilterState, search: 'bluff' }, 'strategy')).toBe(false);
    expect(isKeywordLit(initialFilterState, 'bluffing')).toBe(false);
  });
});

describe('litKeywords', () => {
  it('holds every keyword isKeywordLit lights, and no other', () => {
    const state = { ...initialFilterState, keywords: new Set<KeywordId>(['party']), search: 'strat' };
    expect([...litKeywords(state)].sort()).toEqual(['party', 'strategy']);
    expect(litKeywords(initialFilterState).size).toBe(0);
  });
});
