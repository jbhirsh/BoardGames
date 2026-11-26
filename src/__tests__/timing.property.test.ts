// @vitest-environment node
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FIELDS_SHOWN,
  FIELD_NAME_LENGTH,
  FIELD_SHOWN_MS,
  fieldPath,
  fieldsShown,
  serverTimingHeader,
} from '../../api/_lib/timing';

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
  .map((f) => ({ ...f, slowestMs: f.ms / f.calls }));

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
      /^field\.[!#$%&'*+.^_`|~0-9A-Za-z-]+;dur=\d+(\.\d)?;desc="[_0-9A-Za-z.]+";calls=\d+(;slowest=\d+(\.\d)?)?$/;
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
