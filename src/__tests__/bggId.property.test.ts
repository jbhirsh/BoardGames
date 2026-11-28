import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseBggId } from '../../api/_lib/bggId';

// The pasted id or link (api/_lib/bggId.ts) over whatever the owner's clipboard holds.

const anything = fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined), fc.integer(), fc.object());
const id = fc.integer({ min: 1, max: 2_147_483_647 });
const space = fc.constantFrom('', ' ', '\t', '\n', '  ');

describe('parseBggId, for any input', () => {
  it('never throws, and answers a positive whole number or null', () => {
    fc.assert(
      fc.property(anything, (raw) => {
        const parsed = parseBggId(raw);
        expect(parsed === null || (Number.isInteger(parsed) && parsed > 0)).toBe(true);
      }),
    );
  });

  it('reads back the id it was given, bare or in a game link, whatever surrounds it', () => {
    fc.assert(
      fc.property(
        id,
        space,
        space,
        fc.constantFrom('boardgame', 'boardgameexpansion'),
        fc.webSegment(),
        (n, a, b, kind, slug) => {
          expect(parseBggId(`${a}${n}${b}`)).toBe(n);
          expect(parseBggId(`${a}https://boardgamegeek.com/${kind}/${n}/${slug}${b}`)).toBe(n);
          expect(parseBggId(`${a}boardgamegeek.com/${kind}/${n}${b}`)).toBe(n);
        },
      ),
    );
  });

  it('refuses a link to any other host, however it is spelled', () => {
    const host = fc.domain().filter((h) => !/^(www\.)?boardgamegeek\.com$/i.test(h));
    fc.assert(
      fc.property(host, id, (h, n) => {
        expect(parseBggId(`https://${h}/boardgame/${n}/x`)).toBeNull();
        expect(parseBggId(`https://boardgamegeek.com.${h}/boardgame/${n}`)).toBeNull();
      }),
    );
  });

  it('refuses ids past what the column holds, and zero', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2_147_483_648, max: Number.MAX_SAFE_INTEGER }), (n) => {
        expect(parseBggId(String(n))).toBeNull();
      }),
    );
    expect(parseBggId('0')).toBeNull();
  });
});
