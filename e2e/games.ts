import seed from '../data/seed.json' with { type: 'json' };
import { ALL_GAMES, COMING_SOON as COMPILED_COMING_SOON, GAMES as COMPILED_GAMES } from '../src/data/games';
import type { Game } from '../src/data/types';

/**
 * The games query's stubbed answer (Query.games): the wishlist the one-time
 * copy puts in the database (data/seed.json), one approved friend's
 * suggestion, and made-up BoardGameGeek data for every game the site knows,
 * so the collection and the wishlist show difficulties and awards as they
 * would. None of it is BoardGameGeek's: a weight is worked out from the id,
 * and the honours are a few made up for the specs that open them.
 */

/** One approved friend suggestion, as the games query answers it. */
export const SUGGESTION = {
  id: 'sug-0e2e0e2e0e2e',
  game: 'Fixture Quest',
  name: 'Robin',
  note: 'We loved it at game night',
} as const;

/** A made-up weight for a BGG id, 1.0 to 4.9, the same on every run. */
const fixtureWeight = (bggId: number): number => 1 + ((bggId * 7) % 40) / 10;

/** Made-up honours, by BGG id: Ticket to Ride's two wins and a nomination, and Azul's win. */
const HONOURS: Record<number, Array<{ name: string; year: number; result: string }>> = {
  230802: [{ name: 'Fixture Award Best Abstract Game', year: 2018, result: 'Winner' }],
  9209: [
    { name: 'Spiel des Jahres', year: 2004, result: 'Winner' },
    { name: 'Fixture Award Best Family Game', year: 2004, result: 'Winner' },
    { name: 'Fixture Award Game of the Year', year: 2005, result: 'Nominee' },
  ],
};

const SOURCES = { curated: 'CURATED', friend: 'FRIEND', owner: 'OWNER' } as const;

const ids = [
  ...ALL_GAMES.flatMap((g) => [g, ...(g.subgames ?? [])]).flatMap((t) => (t.bgg === undefined ? [] : [t.bgg])),
  ...seed.wishlist.map((w) => w.bggId),
];

/** Query.games as the stub answers it. */
export const GAMES_ANSWER = {
  games: {
    wishlist: [
      ...seed.wishlist.map((w) => ({
        expands: null,
        year: null,
        suggestedBy: null,
        ...w,
        source: SOURCES[w.source as keyof typeof SOURCES],
        note: '',
      })),
      {
        id: SUGGESTION.id,
        name: SUGGESTION.game,
        source: 'FRIEND',
        suggestedBy: SUGGESTION.name,
        note: SUGGESTION.note,
        players: '2–4',
        minPlayers: 2,
        maxPlayers: 4,
        dur: '30 min',
        minutes: 30,
        description: 'A made-up game for the end-to-end tests.',
        keywords: ['strategy'],
        section: null,
        expands: null,
        video: null,
        image: null,
        bggId: null,
        year: null,
      },
    ],
    bgg: [...new Set(ids)].map((bggId) => ({
      bggId,
      name: `Game ${bggId}`,
      summary: null,
      weight: fixtureWeight(bggId),
      honours: HONOURS[bggId] ?? [],
    })),
  },
};

/** The collection as the page shows it with the stub's answer: each game with its fixture weight and honours. */
function withFixture<T extends { bgg?: number }>(t: T): T {
  if (t.bgg === undefined) return t;
  return { ...t, weight: fixtureWeight(t.bgg), awards: HONOURS[t.bgg] ?? [] };
}
const shown = (games: Game[]): Game[] =>
  games.map((g) => withFixture({ ...g, ...(g.subgames ? { subgames: g.subgames.map(withFixture) } : {}) }));

export const GAMES = shown(COMPILED_GAMES);
export const COMING_SOON = shown(COMPILED_COMING_SOON);

/** The wishlist's entries by name, in the seed's order. */
export const WISHLIST = seed.wishlist;
