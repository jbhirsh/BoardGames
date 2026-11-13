import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { inferSection } from '../../api/_lib/section';
import { WISHLIST_SECTION_IDS } from '../../api/_lib/limits';

// The section rule (api/_lib/section.ts) over whatever BoardGameGeek's
// players, weight, categories and mechanics might be.

describe('inferSection, for any input', () => {
  it('never throws, and answers one of the five sections', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -5, max: 200 }),
        fc.option(fc.double({ noNaN: false }), { nil: undefined }),
        fc.array(fc.oneof(fc.string(), fc.constantFrom('Party Game', 'Card Game'))),
        fc.array(fc.oneof(fc.string(), fc.constant('Cooperative Game'))),
        (max, weight, categories, mechanics) => {
          expect(WISHLIST_SECTION_IDS).toContain(inferSection({ max, weight, categories, mechanics }));
        },
      ),
    );
  });
});
