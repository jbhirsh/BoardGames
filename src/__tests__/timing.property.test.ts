// @vitest-environment node
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { serverTimingHeader } from '../../api/_lib/timing';

// A Server-Timing entry as RFC 9110 and the Server Timing spec allow: a
// token, optionally `;dur=` and a non-negative decimal.
const ENTRY = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+(;dur=\d+(\.\d)?)?$/;

const duration = fc.oneof(
  fc.double({ min: -1e9, max: 1e9, noNaN: false }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0),
);

describe('serverTimingHeader, for any phases', () => {
  it('never throws, and writes only valid entries, the total last', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.option(duration, { nil: undefined }),
        fc.array(fc.record({ name: fc.string(), ms: duration }), { maxLength: 20 }),
        duration,
        (cold, loadedMs, phases, totalMs) => {
          const header = serverTimingHeader({ cold, ...(loadedMs === undefined ? {} : { loadedMs }), phases, totalMs });
          const entries = header.split(', ');
          for (const entry of entries) expect(entry).toMatch(ENTRY);
          expect(entries).toHaveLength(phases.length + 1 + (cold ? 1 : 0) + (cold && loadedMs !== undefined ? 1 : 0));
          expect(entries.at(-1)).toMatch(/^total;dur=/);
          expect(entries[0] === 'cold').toBe(cold);
        },
      ),
    );
  });
});
