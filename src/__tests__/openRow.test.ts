import { describe, it, expect } from 'vitest';
import { openRowFrom, withOpenRow } from '../utils/openRow';

describe('openRowFrom', () => {
  it('reads the open row from a location state', () => {
    expect(openRowFrom({ openRow: 'Catan' })).toBe('Catan');
    expect(openRowFrom({ openRow: 'Catan', other: 1 })).toBe('Catan');
  });

  it.each([undefined, null, {}, { openRow: 3 }, { openRow: null }, { fromList: true }])(
    'is null when the state records no row (%j)',
    (state) => {
      expect(openRowFrom(state)).toBeNull();
    },
  );
});

describe('withOpenRow', () => {
  it('sets the row on an empty state', () => {
    expect(withOpenRow(undefined, 'Catan')).toEqual({ openRow: 'Catan' });
    expect(withOpenRow(null, 'Catan')).toEqual({ openRow: 'Catan' });
  });

  it('replaces the row and keeps the rest of the state', () => {
    expect(withOpenRow({ openRow: 'Catan', other: 1 }, 'Dominion')).toEqual({ openRow: 'Dominion', other: 1 });
  });

  it('drops the row for null, keeping the rest', () => {
    expect(withOpenRow({ openRow: 'Catan', other: 1 }, null)).toEqual({ other: 1 });
    expect(withOpenRow(null, null)).toEqual({});
  });

  it('leaves the state it was given untouched', () => {
    const state = { openRow: 'Catan' };
    withOpenRow(state, null);
    expect(state).toEqual({ openRow: 'Catan' });
  });
});
