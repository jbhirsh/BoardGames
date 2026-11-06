import { describe, it, expect } from 'vitest';
import { isOwnerEmail } from '../../api/_lib/owner';

describe('isOwnerEmail', () => {
  it("matches the owner's address trimmed and in any case", () => {
    expect(isOwnerEmail('jess@example.com', 'jess@example.com')).toBe(true);
    expect(isOwnerEmail(' Jess@Example.COM ', 'jess@example.com')).toBe(true);
    expect(isOwnerEmail('jess@example.com', '  JESS@example.com\n')).toBe(true);
  });

  it('matches nothing else, and no one without an owner set', () => {
    expect(isOwnerEmail('sam.rivera@gmail.com', 'jess@example.com')).toBe(false);
    expect(isOwnerEmail('jess@example.co', 'jess@example.com')).toBe(false);
    expect(isOwnerEmail('jess@example.com', null)).toBe(false);
    expect(isOwnerEmail('jess@example.com', undefined)).toBe(false);
    expect(isOwnerEmail('', '')).toBe(false);
    expect(isOwnerEmail('  ', ' ')).toBe(false);
    expect(isOwnerEmail(undefined, 'jess@example.com')).toBe(false);
    expect(isOwnerEmail(null, 'jess@example.com')).toBe(false);
  });
});
