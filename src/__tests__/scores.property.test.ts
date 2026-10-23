// Property tests (fast-check) for the score pads' arithmetic: places, the 7
// Wonders sheet and the number boxes, over generated tables rather than
// hand-picked ones. A failure prints the seed and the shrunk counterexample;
// pass them to fc.assert to replay it.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { places, type TieBreak } from '../utils/standings';
import { SCIENCE_SYMBOLS, breakdown, scienceScore, standings, type Tally } from '../utils/sevenWonders';
import { cleanInput, isBoxText, num } from '../utils/scoreInput';

const score = fc.integer({ min: -50, max: 200 });

/** Totals for 1–8 players, with tie-breaks of the same length. */
const table = fc.integer({ min: 1, max: 8 }).chain((n) =>
  fc.record({
    totals: fc.array(score, { minLength: n, maxLength: n }),
    breaks: fc.array(
      fc.array(fc.integer({ min: 0, max: 5 }), { minLength: n, maxLength: n }).map((values) => ({
        label: 'a tie-break',
        values,
      })),
      { maxLength: 2 },
    ),
  }),
);

/** How many players beat player `i` on total, then each tie-break in turn. */
function ahead(totals: readonly number[], breaks: readonly TieBreak[], i: number): number {
  const key = (p: number) => [totals[p], ...breaks.map((b) => b.values[p])];
  const mine = key(i);
  return totals.filter((_, p) => {
    const theirs = key(p);
    const k = theirs.findIndex((v, j) => v !== mine[j]);
    return k !== -1 && theirs[k] > mine[k];
  }).length;
}

describe('places (properties)', () => {
  it('puts each player one below everyone who beats them', () => {
    fc.assert(
      fc.property(table, ({ totals, breaks }) => {
        const result = places(totals, breaks);
        expect(result).toEqual(totals.map((_, i) => 1 + ahead(totals, breaks, i)));
        expect(result).toContain(1);
      }),
    );
  });

  it('only splits ties with a tie-break, never reorders by it', () => {
    fc.assert(
      fc.property(table, ({ totals, breaks }) => {
        const plain = places(totals);
        const broken = places(totals, breaks);
        totals.forEach((_, i) => {
          expect(broken[i]).toBeGreaterThanOrEqual(plain[i]);
          totals.forEach((_, j) => {
            if (totals[i] > totals[j]) expect(broken[i]).toBeLessThan(broken[j]);
          });
        });
      }),
    );
  });

  it("doesn't depend on the order players are listed in", () => {
    fc.assert(
      fc.property(
        table.chain(({ totals, breaks }) =>
          fc
            .shuffledSubarray(
              totals.map((_, i) => i),
              { minLength: totals.length, maxLength: totals.length },
            )
            .map((order) => ({ totals, breaks, order })),
        ),
        ({ totals, breaks, order }) => {
          const before = places(totals, breaks);
          const after = places(
            order.map((i) => totals[i]),
            breaks.map((b) => ({ ...b, values: order.map((i) => b.values[i]) })),
          );
          expect(after).toEqual(order.map((i) => before[i]));
        },
      ),
    );
  });
});

const count = fc.integer({ min: 0, max: 20 });
const tally: fc.Arbitrary<Tally> = fc.record({
  military: fc.integer({ min: -6, max: 18 }),
  coins: fc.integer({ min: 0, max: 60 }),
  wonder: fc.integer({ min: 0, max: 20 }),
  civilian: fc.integer({ min: 0, max: 40 }),
  commercial: fc.integer({ min: 0, max: 20 }),
  guilds: fc.integer({ min: 0, max: 30 }),
  symbols: fc.record({ tablets: count, compasses: count, gears: count }),
});

describe('7 Wonders sheet (properties)', () => {
  it('totals exactly its rows', () => {
    fc.assert(
      fc.property(tally, (t) => {
        const { total, ...rows } = breakdown(t);
        expect(total).toBe(Object.values(rows).reduce((sum, vp) => sum + vp, 0));
      }),
    );
  });

  it('never scores less science for one more symbol', () => {
    fc.assert(
      fc.property(tally, fc.constantFrom(...SCIENCE_SYMBOLS), ({ symbols }, symbol) => {
        expect(scienceScore({ ...symbols, [symbol]: symbols[symbol] + 1 })).toBeGreaterThan(scienceScore(symbols));
      }),
    );
  });

  it('places by total, then coins, with players level on both sharing', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ total: score, coins: count }), { minLength: 1, maxLength: 8 }), (scores) => {
        const byPlayer = new Map(standings(scores).map((s) => [s.player, s.place]));
        expect([...byPlayer.keys()].sort((a, b) => a - b)).toEqual(scores.map((_, i) => i));
        scores.forEach((s, i) => {
          const better = scores.filter((o) => o.total > s.total || (o.total === s.total && o.coins > s.coins));
          expect(byPlayer.get(i)).toBe(1 + better.length);
        });
      }),
    );
  });
});

describe('number boxes (properties)', () => {
  const max = fc.integer({ min: 1, max: 999 });

  it('store only box text, within the bounds, whatever is typed', () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), max, (typed, allowNeg, cap) => {
        const stored = cleanInput(typed, allowNeg, cap);
        expect(isBoxText(stored)).toBe(true);
        expect(num(stored)).toBeLessThanOrEqual(cap);
        expect(num(stored)).toBeGreaterThanOrEqual(allowNeg ? -cap : 0);
      }),
    );
  });

  it('leave clean text as it is', () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), max, (typed, allowNeg, cap) => {
        const stored = cleanInput(typed, allowNeg, cap);
        expect(cleanInput(stored, allowNeg, cap)).toBe(stored);
      }),
    );
  });

  it('read back any whole number they stored', () => {
    fc.assert(
      fc.property(fc.integer({ min: -999, max: 999 }), (n) => {
        expect(num(cleanInput(String(n), true, 999))).toBe(n);
      }),
    );
  });
});
