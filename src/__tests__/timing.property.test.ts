// @vitest-environment node
import fc from 'fast-check';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FIELDS_SHOWN,
  FIELD_NAME_LENGTH,
  FIELD_SHOWN_MS,
  fieldPath,
  fieldsShown,
  phaseSync,
  serverTimingHeader,
  timeField,
  timeRequest,
  type FieldTime,
} from '../../api/_lib/timing';

afterEach(() => {
  vi.restoreAllMocks();
});

// A Server-Timing entry as RFC 9110 and the Server Timing spec allow: a
// token, optionally `;dur=` and a non-negative decimal, and `;start=` too.
const ENTRY = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+(;dur=\d+(\.\d)?)?(;start=\d+(\.\d)?)?$/;

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
        fc.array(fc.record({ name: fc.string(), ms: duration, startMs: fc.option(duration, { nil: undefined }) }), {
          maxLength: 20,
        }),
        duration,
        (cold, loadedMs, phases, totalMs) => {
          const header = serverTimingHeader({
            cold,
            ...(loadedMs === undefined ? {} : { loadedMs }),
            phases,
            fields: [],
            totalMs,
          });
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

// A GraphQL name, as the parser accepts it, and a list item number.
const name = fc.stringMatching(/^[_A-Za-z][_0-9A-Za-z]{0,12}$/);
const segment = fc.oneof(name, fc.nat({ max: 999 }).map(String));

describe('fieldPath, for any response path', () => {
  it('keeps every name in order and drops every list item number', () => {
    fc.assert(
      fc.property(fc.array(segment, { minLength: 1, maxLength: 8 }), (keys) => {
        const path = fieldPath(keys.join('.'));
        expect(path).toBe(keys.filter((key) => !/^\d+$/.test(key)).join('.'));
        expect(fieldPath(path)).toBe(path);
      }),
    );
  });
});

const fieldTime = fc
  .record({
    path: fc
      .array(fc.oneof(name, fc.stringMatching(/^[_A-Za-z][_0-9A-Za-z]{60,200}$/)), { minLength: 1, maxLength: 4 })
      .map((keys) => keys.join('.')),
    label: fc.tuple(name, name).map(([type, field]) => `${type}.${field}`),
    ms: fc.double({ min: 0, max: 1e5, noNaN: true }),
    calls: fc.integer({ min: 1, max: 500 }),
  })
  .chain((f) =>
    fc
      .record({ startMs: fc.option(duration, { nil: undefined }), spanMs: fc.option(duration, { nil: undefined }) })
      .map(({ startMs, spanMs }): FieldTime => ({
        ...f,
        slowestMs: f.ms / f.calls,
        ...(startMs === undefined ? {} : { startMs }),
        ...(spanMs === undefined ? {} : { spanMs }),
      })),
  );

describe('fieldsShown and the header, for any fields', () => {
  it('shows every root field, then at most FIELDS_SHOWN others of at least FIELD_SHOWN_MS, slowest first', () => {
    fc.assert(
      fc.property(fc.array(fieldTime, { maxLength: 40 }), (fields) => {
        const shown = fieldsShown(fields);
        const roots = fields.filter((f) => !f.path.includes('.'));
        expect(shown.slice(0, roots.length)).toEqual(roots);
        const others = shown.slice(roots.length);
        expect(others.length).toBeLessThanOrEqual(FIELDS_SHOWN);
        expect(others.every((f) => f.path.includes('.') && f.ms >= FIELD_SHOWN_MS)).toBe(true);
        expect(others.every((f, i) => i === 0 || others[i - 1].ms >= f.ms)).toBe(true);
      }),
    );
  });

  it('writes only valid entries, a field with its desc, the total last', () => {
    const FIELD_ENTRY =
      /^field\.[!#$%&'*+.^_`|~0-9A-Za-z-]+;dur=\d+(\.\d)?;desc="[_0-9A-Za-z.]+";calls=\d+(;slowest=\d+(\.\d)?(;span=\d+(\.\d)?)?)?(;start=\d+(\.\d)?)?$/;
    fc.assert(
      fc.property(fc.array(fieldTime, { maxLength: 15 }), duration, (fields, totalMs) => {
        const entries = serverTimingHeader({ cold: false, phases: [], fields, totalMs }).split(', ');
        expect(entries.slice(0, -1)).toHaveLength(fields.length);
        entries.slice(0, -1).forEach((entry, i) => {
          expect(entry).toMatch(FIELD_ENTRY);
          expect(entry.split(';')[0].length).toBeLessThanOrEqual(FIELD_NAME_LENGTH);
          expect(entry.includes(';slowest=')).toBe(fields[i].calls > 1);
        });
        expect(entries.at(-1)).toMatch(/^total;dur=/);
      }),
    );
  });
});

/** A parameter's value in an entry, as the probe reads it, or undefined. */
const param = (entry: string, key: string) => {
  const found = new RegExp(`;${key}=([^;]*)`).exec(entry);
  return found ? Number(found[1]) : undefined;
};

describe('the header, for any starts and spans', () => {
  it('writes start= on exactly the entries that have one, and span= on a repeated field that has one', () => {
    const phase = fc.record({ name: fc.string(), ms: duration, startMs: fc.option(duration, { nil: undefined }) });
    fc.assert(
      fc.property(fc.array(phase, { maxLength: 10 }), fc.array(fieldTime, { maxLength: 10 }), (phases, fields) => {
        const entries = serverTimingHeader({ cold: false, phases, fields, totalMs: 1 }).split(', ');
        phases.forEach(({ startMs }, i) => {
          expect(param(entries[i], 'start') === undefined).toBe(startMs === undefined);
        });
        fields.forEach(({ startMs, spanMs, calls }, i) => {
          const entry = entries[phases.length + i];
          expect(param(entry, 'start') === undefined).toBe(startMs === undefined);
          expect(param(entry, 'span') === undefined).toBe(spanMs === undefined || calls === 1);
        });
      }),
    );
  });
});

describe('timeRequest, for any clock', () => {
  it("records each part's start as the clock's steps before it, a repeated field's span from its first start to its last end, and nothing ending past the total", async () => {
    // Each step is how far the clock moves: before a piece of work starts,
    // and while it runs. Whole numbers, so the sums are exact.
    const work = fc.record({
      kind: fc.constantFrom('phase', 'field', 'field in phase'),
      name: fc.constantFrom('a', 'b', 'c'),
      before: fc.nat({ max: 1000 }),
      during: fc.nat({ max: 1000 }),
    });
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 1e6 }),
        fc.array(work, { maxLength: 12 }),
        fc.nat({ max: 1000 }),
        async (from, list, after) => {
          let now = from;
          const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
          const field = (name: string, during: number) =>
            timeField(`Item.${name}`, `items.0.${name}`, () => {
              now += during;
              return name;
            });
          const said = await timeRequest(async (read) => {
            for (const { kind, name, before, during } of list) {
              now += before;
              if (kind === 'phase') phaseSync(name, () => (now += during));
              else if (kind === 'field') field(name, during);
              else phaseSync(name, () => field(name, during));
            }
            now += after;
            return read();
          });
          clock.mockRestore();

          // The same work, added up by hand.
          const phases: Array<{ name: string; ms: number; startMs: number }> = [];
          const fields = new Map<string, FieldTime>();
          let at = 0;
          for (const { kind, name, before, during } of list) {
            at += before;
            if (kind !== 'phase') {
              const path = `items.${name}`;
              const known = fields.get(path);
              if (known) {
                known.ms += during;
                known.calls += 1;
                known.slowestMs = Math.max(known.slowestMs, during);
                known.spanMs = at + during - (known.startMs ?? 0);
              } else {
                fields.set(path, {
                  path,
                  label: `Item.${name}`,
                  ms: during,
                  calls: 1,
                  slowestMs: during,
                  startMs: at,
                  spanMs: during,
                });
              }
            }
            if (kind !== 'field') phases.push({ name, ms: during, startMs: at });
            at += during;
          }
          expect(said.totalMs).toBe(at + after);
          expect(said.phases).toEqual(phases);
          const shown = [...fields.values()].filter((f) => f.ms >= FIELD_SHOWN_MS);
          expect(new Set(said.fields.map((f) => f.path))).toEqual(new Set(shown.map((f) => f.path)));
          for (const f of said.fields) expect(f).toEqual(fields.get(f.path));
          for (const part of [...said.phases, ...said.fields]) {
            expect((part.startMs ?? 0) + ('spanMs' in part ? (part.spanMs ?? 0) : part.ms)).toBeLessThanOrEqual(
              said.totalMs,
            );
          }
        },
      ),
    );
  });
});
