// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import seed from '../../data/seed.json';
import { checked, gameRow } from '../../api/_db/validation';
import { ALL_GAMES } from '../data/games';
import { KW } from '../data/keywords';
import { normalizeName } from '../utils/normalizeName';
import { expectCoherentTable } from './coherentTable';
import { WISHLIST } from './helpers/wishlist';

/**
 * The 39 written wishlist entries the one-time copy puts in the database
 * (data/seed.json), which the tests and e2e render too. The wishlist
 * shares the collection's filter fields; keep them coherent.
 */
describe('the seed wishlist', () => {
  it('holds 39 games rows the database takes', () => {
    expect(seed.wishlist).toHaveLength(39);
    for (const row of seed.wishlist) expect(() => checked(gameRow, row, row.id)).not.toThrow();
  });

  it('gives every entry its own BoardGameGeek id and bundled art', () => {
    const ids = WISHLIST.map((w) => w.bgg);
    for (const id of ids) expect(Number.isInteger(id) && (id as number) > 0).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of WISHLIST) {
      expect(w.img, w.id).toMatch(new RegExp(`^/images/wishlist/${w.id}\\.(jpg|png|webp)$`));
      expect(existsSync(join('public', w.img!)), w.img).toBe(true);
    }
  });

  it('names, for every expansion, a base game in the collection or on the wishlist', () => {
    const known = new Set([...ALL_GAMES, ...WISHLIST].map((g) => g.name));
    const expansions = WISHLIST.filter((w) => w.expands);
    expect(expansions.map((w) => w.id)).toEqual(
      expect.arrayContaining(['catan-seafarers', 'dominion-seaside', 'dominion-prosperity', 'wyrmspan-dragon-academy']),
    );
    for (const w of expansions) expect(known.has(w.expands!), `${w.id}: ${w.expands}`).toBe(true);
  });

  it('gives every entry a name no other entry matches', () => {
    // The API refuses a duplicate by the normalised name, so two entries
    // sharing one would make each block the other's edits.
    const keys = WISHLIST.map((w) => normalizeName(w.name));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(WISHLIST.map((w) => [w.id, w] as const))('%s has coherent filter fields', (id, w) => {
    // The time filter reads `mins` as the long end of `dur`, as it does a
    // game's, so "Up to 60 min" would keep a 40–80 min game stored as 60.
    expectCoherentTable(w, id);
    expect(w.dur).toMatch(/min$/);
    expect(w.kw.length).toBeGreaterThan(0);
    for (const k of w.kw) expect(Object.keys(KW)).toContain(k);
  });
});
