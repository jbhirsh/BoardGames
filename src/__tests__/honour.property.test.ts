import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseHonour } from '../../api/_lib/bgg';

// The honour parse (api/_lib/bgg.ts) over whatever name BoardGameGeek might
// give an honour.

const year = fc.integer({ min: 1900, max: 2099 });
const word = fc.constantFrom('Winner', 'Nominee', 'Finalist', 'Recommended', '2nd Place', "d'Argent", 'de Bronze', '');

describe('parseHonour, for any name', () => {
  it('never throws, and answers a name, a result, and a year or none', () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const h = parseHonour(raw);
        expect(typeof h.name).toBe('string');
        expect(h.result.length).toBeGreaterThan(0);
        expect(h.year === null || Number.isInteger(h.year)).toBe(true);
      }),
    );
  });

  // Every BGG honour names its award: a year with nothing after it (a name
  // of only spaces and no result word) is no honour, and has no year to read.
  const award = fc.string({ minLength: 1 }).filter((s) => s.trim() !== '');

  it('reads back the leading year of any honour that has one', () => {
    fc.assert(
      fc.property(year, award, word, (y, award, result) => {
        expect(parseHonour(`${y} ${award} ${result}`).year).toBe(y);
      }),
    );
  });
});
