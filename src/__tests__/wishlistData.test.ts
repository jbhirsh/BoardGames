import { describe, it, expect } from 'vitest';
import { WISHLIST } from '../data/wishlist';
import { KW } from '../data/keywords';
import { durationCategory } from '../hooks/useSuggestions';

/** The wishlist shares the collection's filter fields; keep them coherent. */
describe('wishlist data', () => {
  it('carries bundled box art only from the generated map, as a local path', () => {
    for (const w of WISHLIST) {
      expect(w.img === undefined || w.img.startsWith('/images/wishlist/')).toBe(true);
    }
  });

  it.each(WISHLIST.map((w) => [w.id, w] as const))('%s has coherent filter fields', (_id, w) => {
    expect(w.min).toBeGreaterThan(0);
    expect(w.max).toBeGreaterThanOrEqual(w.min);
    expect(w.mins).toBeGreaterThan(0);
    expect(w.cat).toBe(durationCategory(w.mins));
    expect(w.dur).toMatch(/min$/);
    expect(w.kw.length).toBeGreaterThan(0);
    for (const k of w.kw) expect(Object.keys(KW)).toContain(k);
  });
});
