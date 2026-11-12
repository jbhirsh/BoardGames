import { describe, it, expect } from 'vitest';
import { parseIdList, optionalAnonId, ANON_RE, MAX_IDS } from '../../api/_lib/ids';
import { NAME_RE as CLIENT_NAME_RE } from '../utils/displayName';

const errorOf = (v: string[]) => {
  const r = parseIdList(v);
  return r.ok ? undefined : r.error;
};
const idsOf = (v: string[]) => {
  const r = parseIdList(v);
  return r.ok ? r.ids : undefined;
};

describe('parseIdList', () => {
  it('requires at least one id', () => {
    expect(errorOf([])).toMatch(/required/);
  });

  it('trims ids, drops malformed slugs and errors when none remain', () => {
    expect(idsOf([' azul ', 'Bad Slug', 'catan'])).toEqual(['azul', 'catan']);
    expect(errorOf(['Bad!'])).toMatch(/valid slug/);
  });

  it('caps the list', () => {
    expect(errorOf(Array.from({ length: MAX_IDS + 1 }, (_, i) => `g${i}`))).toMatch(/too many/);
    expect(idsOf(Array.from({ length: MAX_IDS }, (_, i) => `g${i}`))).toHaveLength(MAX_IDS);
  });
});

describe('optionalAnonId', () => {
  it('returns the id only when it matches the anon shape', () => {
    expect(optionalAnonId('anon-12345678')).toBe('anon-12345678');
    expect(optionalAnonId('x')).toBeNull();
    expect(optionalAnonId(undefined)).toBeNull();
    expect(ANON_RE.test('a'.repeat(65))).toBe(false);
  });
});

describe('display-name pattern', () => {
  it('matches the server pattern behaviour on representative names', () => {
    const ok = ['Jess', 'Mary-Kate', "O'Brien", 'J. R.', '2024', 'Zoë', 'x'.repeat(30)];
    const bad = ['', ' Jess', 'Jo & Bo', 'sam_1', '<b>', 'x'.repeat(31), 'O’Brien'];
    for (const n of ok) expect(CLIENT_NAME_RE.test(n), n).toBe(true);
    for (const n of bad) expect(CLIENT_NAME_RE.test(n), n).toBe(false);
  });
});
