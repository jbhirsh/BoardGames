import { describe, expect, it } from 'vitest';
import { lookupNotice, type LookupOutcome } from '../utils/lookupNotice';

describe('lookupNotice', () => {
  it('stays quiet when the lookup found the game or none ran', () => {
    for (const context of ['preview', 'approved'] as const) {
      expect(lookupNotice('found', 'Wingspan', context)).toBeNull();
      expect(lookupNotice(undefined, 'Wingspan', context)).toBeNull();
    }
  });

  it('ignores an outcome it does not know rather than saying something wrong', () => {
    expect(lookupNotice('later' as LookupOutcome, 'Wingspan', 'preview')).toBeNull();
  });

  it('on the add form, says why the lookup found nothing and what can still be done', () => {
    expect(lookupNotice('no-match', 'Magical Athlete', 'preview')).toBe(
      'BoardGameGeek had no match for “Magical Athlete”. Check the name and look it up again, or add it anyway and fill in its details with Edit.');
    expect(lookupNotice('no-token', 'Magical Athlete', 'preview')).toBe(
      "“Magical Athlete” couldn't be looked up: the BoardGameGeek token (BGG_API_TOKEN) is missing. Add it anyway and fill in its details with Edit, or set the token, redeploy, then look it up again.");
    expect(lookupNotice('refused', 'Magical Athlete', 'preview')).toBe(
      "“Magical Athlete” couldn't be looked up: BoardGameGeek refused the request (check BGG_API_TOKEN). Add it anyway and fill in its details with Edit, or check the token and look it up again.");
    expect(lookupNotice('unavailable', 'Magical Athlete', 'preview')).toBe(
      "BoardGameGeek didn't answer for “Magical Athlete”. Look it up again in a minute, or add it anyway and fill in its details with Edit.");
  });

  it('after an approval, leads with it and points at Edit', () => {
    expect(lookupNotice('no-match', 'Root', 'approved')).toBe('Approved, but BoardGameGeek had no match for “Root”. Fill in its details with Edit.');
    expect(lookupNotice('refused', 'Root', 'approved')).toBe("Approved, but “Root” couldn't be looked up: BoardGameGeek refused the request (check BGG_API_TOKEN). Fill in its details with Edit.");
  });
});
