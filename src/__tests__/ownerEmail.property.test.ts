import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isOwnerEmail } from '../../api/_lib/owner';

// The owner check's comparison (api/_lib/owner.ts) over whatever a Google
// profile or the SUGGESTIONS_TO setting might hold.

const anything = fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined), fc.integer(), fc.object());
const owner = fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined));
const space = fc.constantFrom('', ' ', '  ', '\t', '\n', ' \t ');

describe('isOwnerEmail, for any input', () => {
  it('never throws, and answers a boolean', () => {
    fc.assert(
      fc.property(anything, owner, (email, o) => {
        expect(typeof isOwnerEmail(email, o)).toBe('boolean');
      }),
    );
  });

  it("matches the owner's own address, whatever surrounds it or its case, unless it's blank", () => {
    fc.assert(
      fc.property(fc.emailAddress(), space, space, fc.boolean(), (address, before, after, upper) => {
        const written = upper ? address.toUpperCase() : address;
        expect(isOwnerEmail(`${before}${written}${after}`, address)).toBe(true);
        expect(isOwnerEmail(address, `${after}${written}${before}`)).toBe(true);
      }),
    );
    fc.assert(
      fc.property(space, space, (a, b) => {
        expect(isOwnerEmail(a, b)).toBe(false);
      }),
    );
  });

  it('is symmetric between two strings, and never matches two different addresses', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect(isOwnerEmail(a, b)).toBe(isOwnerEmail(b, a));
      }),
    );
    fc.assert(
      fc.property(fc.emailAddress(), fc.emailAddress(), (a, b) => {
        fc.pre(a.toLowerCase() !== b.toLowerCase());
        expect(isOwnerEmail(a, b)).toBe(false);
      }),
    );
  });
});
