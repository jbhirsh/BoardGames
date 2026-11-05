import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

// The API's tables in Turso (libSQL), defined once here for Drizzle: the row
// types come from these definitions, and `npm run db:generate` writes each
// change to them as a migration in drizzle/, committed beside them and
// applied by scripts/db-migrate.ts at deploy, never at a cold start. CI fails
// when this file and drizzle/ disagree. A migration has to work with the code
// already deployed (Vercel builds before promoting a deploy, and a rollback
// runs old code on the new schema) unless its PR says otherwise. What a
// row may hold beyond its column types (lengths, ranges, the known keyword
// ids) is validation.ts's, checked before a row is written.
//
// Imports nothing of the app's own: the scripts load it with Node, which
// doesn't resolve the API's `./x.js` imports to their `.ts` files.

/** A CHECK holding `column` to `values`, so a status or source no code knows can't be written. */
const oneOf = (name: string, column: AnySQLiteColumn, values: readonly string[]) =>
  check(name, sql`${column} IN (${sql.raw(values.map((v) => `'${v}'`).join(', '))})`);

/**
 * Settings the database keeps about itself. `environment` names the
 * deployment it belongs to (production or preview), written once when a
 * deploy first claims it (scripts/db-migrate.ts); the migrate script and the
 * API refuse a database whose record doesn't match where they run
 * (environment.ts).
 */
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** A game's place: on the wishlist, bought and on its way, on the shelf, or taken off the wishlist. */
export const GAME_STATUSES = ['wanted', 'arriving', 'owned', 'removed'] as const;
/** Where a game came from: the hand-written list (src/data/wishlist.ts), a friend, or the owner on the site. */
export const GAME_SOURCES = ['curated', 'friend', 'owner'] as const;

/**
 * Every game, one row each (#290): today the wishlist's, the hand-written
 * entries and the approved suggestions alike. `id` is the entry's id as the
 * site and the votes know it: a slug for a hand-written entry, `sug-…` for
 * a suggestion. `players` and `dur` are the words a card shows ("2–4",
 * "30–45 min"), none where they aren't known; `minPlayers`, `maxPlayers`
 * and `minutes` are what the filters read (1, 99 and 0 when unknown, which
 * every filter lets through).
 */
export const games = sqliteTable(
  'games',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    status: text('status', { enum: GAME_STATUSES }).notNull(),
    source: text('source', { enum: GAME_SOURCES }).notNull(),
    /** The friend whose suggestion it was, for the card's credit. */
    suggestedBy: text('suggested_by'),
    players: text('players'),
    minPlayers: integer('min_players').notNull(),
    maxPlayers: integer('max_players').notNull(),
    dur: text('dur'),
    /** Playing time in minutes, the long end of `dur`; 0 when unknown. */
    minutes: integer('minutes').notNull(),
    description: text('description').notNull(),
    keywords: text('keywords', { mode: 'json' }).$type<string[]>().notNull(),
    /** The wishlist section it's filed under; none means "Suggested by friends". */
    section: text('section'),
    awards: text('awards', { mode: 'json' }).$type<{ name: string; year: number }[]>().notNull(),
    /** Amazon's product id for the standard edition, where it's been checked. */
    asin: text('asin'),
    /** The game it expands, by name. */
    expands: text('expands'),
    /** What the video link searches YouTube for. */
    video: text('video'),
    /** Box art: a path the app serves, or a BoardGameGeek image link. */
    image: text('image'),
    bggId: integer('bgg_id'),
    year: integer('year'),
    /** BoardGameGeek's weight, 1 (light) to 5 (heavy). */
    weight: real('weight'),
    /** When it was added on the site, in ms; none for a hand-written entry. */
    createdAt: integer('created_at'),
  },
  (t) => [
    index('games_status').on(t.status),
    oneOf('games_status_known', t.status, GAME_STATUSES),
    oneOf('games_source_known', t.source, GAME_SOURCES),
  ],
);

/** Where a friend's suggestion is: waiting, decided, its email failed, or taken off the wishlist after approval. */
export const SUGGESTION_STATUSES = ['pending', 'approved', 'denied', 'unsent', 'removed'] as const;
/** Who put a suggestion on the list: a friend, or the owner directly. */
export const SUGGESTION_SOURCES = ['friend', 'owner'] as const;

/**
 * Every suggestion, kept after it's decided so an old emailed link can
 * still say what became of it. `gameId` is the game an approval put on the
 * wishlist: its own `sug-…` row, or the game it duplicates. What the game
 * is like (players, time, description, art) lives on that row alone. The
 * emailed links' token isn't kept: from #290's part 2b, the owner's session
 * is what decides a suggestion, from the site or an emailed link.
 */
export const suggestions = sqliteTable(
  'suggestions',
  {
    id: text('id').primaryKey(),
    /** The game's name as the suggester typed it; the game itself is `gameId`'s row. */
    gameName: text('game_name').notNull(),
    /** The display name of whoever suggested it, or the owner's for an owner's add. */
    name: text('name').notNull(),
    note: text('note').notNull(),
    status: text('status', { enum: SUGGESTION_STATUSES }).notNull(),
    source: text('source', { enum: SUGGESTION_SOURCES }).notNull(),
    gameId: text('game_id').references(() => games.id),
    /** In ms, as are the others. */
    createdAt: integer('created_at').notNull(),
    decidedAt: integer('decided_at'),
  },
  (t) => [
    index('suggestions_status').on(t.status),
    oneOf('suggestions_status_known', t.status, SUGGESTION_STATUSES),
    oneOf('suggestions_source_known', t.source, SUGGESTION_SOURCES),
  ],
);

/** One browser's vote for one game: a browser votes for a game once, and can take it back. */
export const votes = sqliteTable(
  'votes',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    /** The anonymous id the browser keeps for itself. */
    anonId: text('anon_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.anonId] })],
);
