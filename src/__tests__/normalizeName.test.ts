import { describe, it, expect } from 'vitest';
import { normalizeName } from '../utils/normalizeName';

describe('normalizeName', () => {
  it('ignores case, punctuation and extra whitespace', () => {
    expect(normalizeName('  7 Wonders:  Duel! ')).toBe('7 wonders duel');
    expect(normalizeName('Ticket to Ride - Europe')).toBe(normalizeName('ticket to ride europe'));
  });

  it('is empty for names with no letters or digits', () => {
    expect(normalizeName('---')).toBe('');
  });
});
