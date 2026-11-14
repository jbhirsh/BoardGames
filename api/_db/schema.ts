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

/** One of a game's honours as BoardGameGeek lists it (api/_lib/bgg.ts's Honour). */
interface StoredHonour {
  name: string;
  year: number | null;
  result: string;
}

/** A game's place: on the wishlist, bought and on its way, on the shelf, or taken off the wishlist. */
export const GAME_STATUSES = ['wanted', 'arriving', 'owned', 'removed'] as const;
/** Where a game came from: the hand-written list (data/seed.json, once src/data/wishlist.ts), a friend, or the owner on the site. */
export const GAME_SOURCES = ['curated', 'friend', 'owner'] as const;

/**
 * Every game, one row each (#290): today the wishlist's, the hand-written
 * entries and the approved suggestions alike. `id` is the entry's id as the
 * site and the votes know it: a slug for a hand-written entry, `sug-…` for
 * a suggestion. `players` and `dur` are the words a card shows ("2–4",
 * "30–45 min"), none where they aren't known; `minPlayers`, `maxPlayers`
 * and `minutes` are what the filters read (1, 99 and 0 when unknown, which
 * every filter lets through). Its weight, summary and awards are BoardGameGeek's,
 * kept by BGG id in `bgg_info` (with `owner_awards`), as the collection's are.
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
    /** The game it expands, by name. */
    expands: text('expands'),
    /** What the video link searches YouTube for. */
    video: text('video'),
    /** Box art: a path the app serves, or a BoardGameGeek image link. */
    image: text('image'),
    bggId: integer('bgg_id'),
    year: integer('year'),
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

/**
 * What BoardGameGeek says about a game, by its BGG id, for the wishlist's
 * games and the collection's alike (#290's part 2b): its name, its one-line
 * summary, its honours and its weight. Filled when a game is approved or
 * added, by the one-time copy, and by each production build's refresh
 * (scripts/bgg-refresh.ts), oldest first. None of BGG's data is in the code.
 */
export const bggInfo = sqliteTable('bgg_info', {
  bggId: integer('bgg_id').primaryKey(),
  /** BGG's primary name. */
  name: text('name').notNull(),
  /** BGG's one-line summary (`short_description`), none when it has none. */
  summary: text('summary'),
  honours: text('honours', { mode: 'json' }).$type<StoredHonour[]>().notNull(),
  /** The community's weight, 1 (light) to 5 (heavy); none when nobody has rated it. */
  weight: real('weight'),
  /**
   * Another BGG id whose honours this game shows: a later edition with none
   * of its own (Dominion's second edition shows the first's).
   */
  honoursFrom: integer('honours_from'),
  /** When BGG was last asked, in ms; zero for a row the copy made without an answer. */
  fetchedAt: integer('fetched_at').notNull(),
});

/**
 * Wins the owner confirmed by hand that BoardGameGeek doesn't list (the Dice
 * Tower Awards, most Origins Awards), by BGG id so the collection's games keep
 * theirs before they have rows. They count as wins beside BGG's.
 */
export const ownerAwards = sqliteTable(
  'owner_awards',
  {
    bggId: integer('bgg_id').notNull(),
    name: text('name').notNull(),
    year: integer('year').notNull(),
  },
  (t) => [primaryKey({ columns: [t.bggId, t.name, t.year] })],
);

/**
 * The rate limits' counters (api/_lib/rateLimit.ts): how many requests a key
 * (`votes:<ip>`, `chat-global`) made in the fixed window starting at
 * `windowStart` (ms). A row is swept once `expiresAt` has passed.
 */
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: integer('window_start').notNull(),
    count: integer('count').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index('rate_limits_expires_at').on(t.expiresAt)],
);

// Sign-in (#296): Better Auth's tables (api/_auth.ts), in the shapes its
// Drizzle adapter reads and its schema check holds them to. Each column's
// key is Better Auth's field name, which the adapter looks a column up by;
// the column itself is snake_case, as the app's are. Dates are milliseconds,
// a new row's taken from the database's clock. A user's sessions, Google
// account and passkeys go with it.

/** When a row was made, in ms, from the database's clock: what Better Auth's `new Date()` defaults become. */
const createdNow = (name: string) =>
  integer(name, { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`);

/**
 * Everyone who has signed in, as Google says they are. Only the one whose
 * verified email is the owner's (SUGGESTIONS_TO) gets anything for it.
 */
export const authUser = sqliteTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
  image: text('image'),
  createdAt: createdNow('created_at').notNull(),
  updatedAt: createdNow('updated_at')
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * A browser's sign-in: its token is the session cookie's, which Better Auth
 * signs. It lasts 30 days from when it was last used.
 */
export const authSession = sqliteTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdNow('created_at').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
  },
  (t) => [index('auth_session_user_id').on(t.userId)],
);

/**
 * A user's Google account. Google's tokens are kept encrypted, and never
 * read: the app asks Google nothing once someone is signed in.
 */
export const authAccount = sqliteTable(
  'auth_account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdNow('created_at').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('auth_account_user_id').on(t.userId)],
);

/** Short-lived values a sign-in needs between two requests: a Google sign-in's state, a passkey's challenge. */
export const authVerification = sqliteTable(
  'auth_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdNow('created_at').notNull(),
    updatedAt: createdNow('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('auth_verification_identifier').on(t.identifier)],
);

/** A passkey (Face ID, Touch ID, a security key) a signed-in user added on a device. */
export const authPasskey = sqliteTable(
  'auth_passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
    transports: text('transports'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
    aaguid: text('aaguid'),
  },
  (t) => [index('auth_passkey_user_id').on(t.userId), index('auth_passkey_credential_id').on(t.credentialID)],
);
