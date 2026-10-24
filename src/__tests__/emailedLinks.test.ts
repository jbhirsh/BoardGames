import { describe, it, expect } from 'vitest';
import { approvalDetails, approvedText, linkProblem, missText, withoutToken } from '../utils/emailedLinks';

const DETAILS = { bggId: 1, name: 'Root', min: 2, max: 4, mins: 90, desc: '', kw: [] };

describe('emailedLinks', () => {
  it('names a refused link by its code', () => {
    expect(linkProblem('BAD_REQUEST')).toBe('Link not recognised');
    expect(linkProblem('NOT_FOUND')).toBe('Suggestion not found');
    expect(linkProblem('FORBIDDEN')).toBe('Link not valid');
    expect(linkProblem('BAD_NAME')).toBe('Name not recognised');
    expect(linkProblem('INTERNAL_SERVER_ERROR')).toBe('Something went wrong');
    expect(linkProblem(undefined)).toBe('Something went wrong');
  });

  it('says why BoardGameGeek has nothing, and what approving does about it', () => {
    expect(missText('Arkham Horry', 'no-match')).toBe(
      'BoardGameGeek had no match for “Arkham Horry”. Approving adds it without details, to fill in with Edit on the site; or correct the name below and look it up again.',
    );
    expect(missText('Arkham Horry', 'no-token')).toMatch(
      /^“Arkham Horry” couldn't be looked up: BGG_API_TOKEN isn't set\. Approving adds it without details/,
    );
    expect(missText('Arkham Horry', 'refused')).toMatch(
      /^“Arkham Horry” couldn't be looked up: BoardGameGeek refused the request \(check BGG_API_TOKEN\)\. Approving adds/,
    );
    expect(missText('Arkham Horry', 'unavailable')).toBe(
      "BoardGameGeek didn't answer for “Arkham Horry”. Approving tries again, and adds it without details if BoardGameGeek still has nothing; or look it up again below.",
    );
  });

  it('approves with what the preview found, none for a miss, and leaves the lookup to the server otherwise', () => {
    expect(approvalDetails({ outcome: 'found', details: DETAILS })).toBe(DETAILS);
    expect(approvalDetails({ outcome: 'found' })).toBeNull();
    for (const outcome of ['no-match', 'no-token', 'refused'] as const) expect(approvalDetails({ outcome })).toBeNull();
    expect(approvalDetails({ outcome: 'unavailable' })).toBeUndefined();
    expect(approvalDetails(null)).toBeUndefined();
  });

  it('says what an approval did, and what the game still lacks', () => {
    expect(approvedText('Root', 'Alex', 'found', DETAILS)).toBe('Root is now on the wishlist, credited to Alex.');
    expect(approvedText('Root', 'Alex', undefined, undefined)).toBe('Root is now on the wishlist, credited to Alex.');
    expect(approvedText('Root', 'Alex', undefined, null)).toBe(
      'Root is now on the wishlist, credited to Alex. It has no details yet: sign in on the site to fill them in with Edit.',
    );
    expect(approvedText('Root', 'Alex', 'no-match', undefined)).toContain('BoardGameGeek had no match for it');
    expect(approvedText('Root', 'Alex', 'no-token', undefined)).toContain("BGG_API_TOKEN isn't set");
    expect(approvedText('Root', 'Alex', 'refused', undefined)).toContain(
      'BoardGameGeek refused the request (check BGG_API_TOKEN)',
    );
    expect(approvedText('Root', 'Alex', 'unavailable', undefined)).toContain("BoardGameGeek didn't answer");
  });

  it('takes a token out of an address, keeping the rest of it', () => {
    expect(withoutToken('https://games.example/approve?id=sug-1&token=abc#x')).toBe(
      'https://games.example/approve?id=sug-1#x',
    );
    expect(withoutToken('/sign-in/confirm?token=abc')).toBe('/sign-in/confirm');
    expect(withoutToken('/?c=want')).toBe('/?c=want');
    expect(withoutToken('https://games.example/rules/catan')).toBe('https://games.example/rules/catan');
  });
});
