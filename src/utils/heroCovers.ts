import type { Game, WishlistItem } from '../data/types';

/**
 * The hero's moving row of box covers: which covers it shows, and where
 * each one leads in the list below. Kept apart from the component so the
 * choices are plain data a test can read.
 */
export interface HeroCover {
  /** The game's slug, or the wishlist entry's id: what the filters are checked against. */
  id: string;
  name: string;
  img: string;
  /** The element id of the game's card or row (`gameAnchor`, `wishAnchor`). */
  anchor: string;
}

/** The element id a collection game's card or list row carries. */
export function gameAnchor(slug: string): string {
  return `game-${slug}`;
}

/** The element id a wishlist entry's card or list row carries. */
export function wishAnchor(id: string): string {
  return `wish-${id}`;
}

/**
 * The favourite boxes the row opens on, which were the hero's whole shelf
 * before it moved. They also make up the still row shown to people who ask
 * for less motion.
 */
export const FAVOURITES = ['catan', 'azul', '7-wonders', 'codenames', 'pandemic', 'ticket-to-ride', 'dominion'];

/** How many covers the still row shows (fewer on a phone, by CSS). */
export const STILL_COUNT = FAVOURITES.length;

/**
 * Seconds each cover takes to pass, so the row moves at one calm speed
 * whatever its length: the lap is this times the number of covers. About
 * 50px a second at the desktop size; a 40-second lap of 30 covers was
 * twice that and read as busy.
 */
export const SECONDS_PER_COVER = 2.4;

/** Every game in the collection, the favourites first and the rest in the collection's order. */
export function ownCovers(games: readonly Game[]): HeroCover[] {
  const rank = (g: Game) => {
    const i = FAVOURITES.indexOf(g.slug);
    return i === -1 ? FAVOURITES.length : i;
  };
  return [...games]
    .sort((a, b) => rank(a) - rank(b))
    .map((g) => ({ id: g.slug, name: g.name, img: g.img, anchor: gameAnchor(g.slug) }));
}

/**
 * The wishlist entries with box art bundled with the site, in the
 * wishlist's order. An approved friend suggestion's art is a BoardGameGeek
 * thumbnail on another server: it would load late, or not at all offline,
 * and leave a blank tile gliding past, so those (and entries with no art)
 * stay out of the row. They still have their cards in the list.
 */
export function wantCovers(items: readonly WishlistItem[]): HeroCover[] {
  return items.flatMap((w) =>
    w.img?.startsWith('/images/') ? [{ id: w.id, name: w.name, img: w.img, anchor: wishAnchor(w.id) }] : [],
  );
}
