import { describe, it, expect } from 'vitest';
import { GAMES } from '../data/games';
import { WISHLIST } from '../data/wishlist';
import type { WishlistItem } from '../data/types';
import { FAVOURITES, STILL_COUNT, gameAnchor, ownCovers, wantCovers, wishAnchor } from '../utils/heroCovers';

describe('ownCovers', () => {
  it("holds every game once, the favourites first in their order, then the collection's", () => {
    const covers = ownCovers(GAMES);
    expect(covers).toHaveLength(GAMES.length);
    expect(covers.slice(0, FAVOURITES.length).map((c) => c.id)).toEqual(FAVOURITES);
    const rest = GAMES.filter((g) => !FAVOURITES.includes(g.slug)).map((g) => g.slug);
    expect(covers.slice(FAVOURITES.length).map((c) => c.id)).toEqual(rest);
  });

  it("gives each cover its game's name, box art and card anchor", () => {
    const catan = GAMES.find((g) => g.slug === 'catan')!;
    expect(ownCovers(GAMES)[0]).toEqual({ id: 'catan', name: catan.name, img: catan.img, anchor: 'game-catan' });
  });

  it('keeps a still row of the favourites', () => {
    expect(STILL_COUNT).toBe(FAVOURITES.length);
  });
});

describe('wantCovers', () => {
  const entry = (id: string, img?: string): WishlistItem => ({ ...WISHLIST[0], id, name: id.toUpperCase(), img });

  it("takes the entries with bundled art, in the wishlist's order", () => {
    const covers = wantCovers([entry('a', '/images/wishlist/a.jpg'), entry('b'), entry('c', '/images/wishlist/c.png')]);
    expect(covers).toEqual([
      { id: 'a', name: 'A', img: '/images/wishlist/a.jpg', anchor: 'wish-a' },
      { id: 'c', name: 'C', img: '/images/wishlist/c.png', anchor: 'wish-c' },
    ]);
  });

  it('leaves out a suggestion whose art is a BoardGameGeek thumbnail', () => {
    expect(wantCovers([entry('s', 'https://cf.geekdo-images.com/x/pic1.jpg')])).toEqual([]);
  });

  it('covers every compiled-in entry that has art', () => {
    expect(wantCovers(WISHLIST).map((c) => c.id)).toEqual(WISHLIST.filter((w) => w.img).map((w) => w.id));
  });
});

describe('anchors', () => {
  it("names a game's card and a wishlist entry's apart", () => {
    expect(gameAnchor('azul')).toBe('game-azul');
    expect(wishAnchor('azul')).toBe('wish-azul');
  });
});
