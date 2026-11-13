import { describe, it, expect } from 'vitest';
import {
  DESC_MAX,
  GAME_MAX,
  GAME_MIN,
  KEYWORD_IDS,
  MINS_MAX,
  NAME_RE,
  NOTE_MAX,
  PLAYERS_MAX,
  WISHLIST_SECTION_IDS,
} from '../../api/_lib/limits';
import { KW, WISHLIST_SECTIONS } from '../data/keywords';
import * as clientLimits from '../data/suggestionLimits';

// The API's bounds (api/_lib/limits.ts) and the client's copies, which the
// two trees can't share.

describe('the API and the client agree', () => {
  it('on the keyword ids and wishlist sections', () => {
    expect([...KEYWORD_IDS].sort()).toEqual(Object.keys(KW).sort());
    expect([...WISHLIST_SECTION_IDS].sort()).toEqual([...WISHLIST_SECTIONS].sort());
  });

  it("on an entry's bounds", () => {
    const { NAME_MAX, ...bounds } = clientLimits;
    expect(bounds).toEqual({ GAME_MIN, GAME_MAX, NOTE_MAX, DESC_MAX, PLAYERS_MAX, MINS_MAX });
    // The name's bound lives in NAME_RE: the longest name it takes is the form's.
    expect(NAME_RE.test('x'.repeat(NAME_MAX))).toBe(true);
    expect(NAME_RE.test('x'.repeat(NAME_MAX + 1))).toBe(false);
  });
});
