import seed from '../../../data/seed.json';
import { ALL_GAMES, COMING_SOON, GAMES } from '../../data/games';
import type { WishlistItem } from '../../data/types';
import {
  collectionWithBgg,
  indexBgg,
  toWishlistItem,
  type BggEntry,
  type BggIndex,
  type ListedGame,
} from '../../utils/bggInfo';

// The wishlist the tests render: the 39 written entries the one-time copy
// puts in the database (data/seed.json), as the games query answers them
// and GamesProvider shapes them.

const SOURCES = { curated: 'CURATED', friend: 'FRIEND', owner: 'OWNER' } as const;

/** The seed's wishlist as the games query answers it. */
const LISTED: ListedGame[] = seed.wishlist.map((g) => ({
  ...g,
  source: SOURCES[g.source as keyof typeof SOURCES],
  note: '',
}));

/** The seed's wishlist as the page shows it, with `bgg` (none by default) for its BoardGameGeek data. */
const wishlistItems = (bgg: BggIndex = new Map()): WishlistItem[] => LISTED.map((g) => toWishlistItem(g, bgg));

export const WISHLIST: WishlistItem[] = wishlistItems();

/** A friend's approved suggestion as the games query answers it, with `over` changed. */
export const suggested = (over: Partial<ListedGame> = {}): ListedGame => ({
  id: 'sug-1',
  name: 'Azul',
  source: 'FRIEND',
  suggestedBy: 'Sam',
  note: '',
  players: null,
  minPlayers: 1,
  maxPlayers: 99,
  dur: null,
  minutes: 0,
  description: '',
  keywords: [],
  section: null,
  bggId: null,
  ...over,
});

/**
 * Made-up BoardGameGeek data for a few games, none of it BGG's: wins and a
 * nomination for Ticket to Ride (in the collection) and Lost Cities (on
 * the wishlist), so pages show award pills.
 */
const FIXTURE_BGG: BggEntry[] = [
  { bggId: 50, weight: 1.5, honours: [{ name: 'Fixture Award Best Card Game', year: 2000, result: 'Winner' }] },
  {
    bggId: 9209,
    weight: 1.8,
    honours: [
      { name: 'Spiel des Jahres', year: 2004, result: 'Winner' },
      { name: 'Fixture Award Best Family Game', year: 2004, result: 'Winner' },
      { name: 'Fixture Award Game of the Year', year: 2005, result: 'Nominee' },
    ],
  },
];

/** A made-up weight for a BGG id, 1.0 to 4.9, the same as e2e's (e2e/games.ts). */
const fixtureWeight = (bggId: number) => 1 + ((bggId * 7) % 40) / 10;

/** Made-up weights for every game in the collection and the games inside them, with FIXTURE_BGG's honours. */
export const COLLECTION_BGG: BggEntry[] = [
  ...new Set(ALL_GAMES.flatMap((g) => [g, ...(g.subgames ?? [])]).flatMap((t) => (t.bgg === undefined ? [] : [t.bgg]))),
].map((bggId) => FIXTURE_BGG.find((f) => f.bggId === bggId) ?? { bggId, weight: fixtureWeight(bggId), honours: [] });

/** The collection as the page shows it with COLLECTION_BGG. */
export const WEIGHED_GAMES = collectionWithBgg(GAMES, indexBgg(COLLECTION_BGG));
export const WEIGHED_COMING_SOON = collectionWithBgg(COMING_SOON, indexBgg(COLLECTION_BGG));

/** The games query's answer: the seed's wishlist and `more` games after it, and `bgg` (FIXTURE_BGG by default). */
export const gamesAnswer = (more: ListedGame[] = [], bgg: BggEntry[] = FIXTURE_BGG) => ({
  games: { wishlist: [...LISTED, ...more], bgg },
});
