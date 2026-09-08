import { describe, it, expect } from 'vitest';
import { GAMES } from '../data/games';
import { WISHLIST } from '../data/wishlist';

/**
 * Ownership ("I own this") keys Redis by id in one flat namespace shared by
 * collection games (slug) and wishlist items (id). That is only sound while
 * every id is unique across both lists — a wishlist entry reusing a game's
 * slug would silently merge the two owner lists.
 */
describe('ownable ids', () => {
  it('are unique across the collection and the wishlist', () => {
    const ids = [...GAMES.map((g) => g.slug), ...WISHLIST.map((w) => w.id)];
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });
});
