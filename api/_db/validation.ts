// What a row may hold beyond its column's type, checked before it's written:
// a schema per table built from its columns (drizzle-zod), so a column added
// there is checked here without being listed twice, with the rules the
// columns can't say (lengths, ranges, the keyword ids the site knows) added
// on top. Each message is worded for whoever sees it: the owner, once the
// API writes these rows (#290's part 2b).

import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { ANON_RE } from '../_lib/ids.js';
import {
  DESC_MAX,
  GAME_MAX,
  GAME_MIN,
  KEYWORD_IDS,
  MINS_MAX,
  NAME_RE,
  NOTE_MAX,
  PLAYERS_MAX,
  WISHLIST_SECTION_IDS,
} from '../_lib/limits.js';
import { SLUG_RE } from '../_lib/slug.js';
import { bggInfo, games, ownerAwards, rateLimits, suggestions, votes } from './schema.js';

// Where box art comes from: a file the app serves, or a link (BoardGameGeek's).
const IMAGE_RE = /^(\/images\/wishlist\/[\w.-]+|https:\/\/\S+)$/;
const KW_MAX = 20;

const keywords = z
  .array(z.enum(KEYWORD_IDS, 'A keyword has to be one the site knows'))
  .max(KW_MAX, `A game takes at most ${KW_MAX} keywords`)
  .refine((kw) => new Set(kw).size === kw.length, 'A keyword is listed once');
const section = z.enum(WISHLIST_SECTION_IDS, 'A section has to be one of the wishlist’s');
const image = z.string().regex(IMAGE_RE, 'Box art is a file the site serves or an https link');

const nameOfGame = (s: z.ZodString) =>
  s
    .min(GAME_MIN, `A game's name needs at least ${GAME_MIN} characters`)
    .max(GAME_MAX, `A game's name can be at most ${GAME_MAX} characters`);
const players = (what: string) => (s: z.ZodNumber) =>
  s
    .int(`The ${what} players is a whole number`)
    .min(1, `The ${what} players is at least 1`)
    .max(PLAYERS_MAX, `The ${what} players is at most ${PLAYERS_MAX}`);
const when = (s: z.ZodNumber) => s.int('A time is whole milliseconds').min(0, 'A time is after 1970');
const bggId = (s: z.ZodNumber) =>
  s.int('A BoardGameGeek id is a whole number').positive('A BoardGameGeek id is above 0');
const awardName = (s: z.ZodString) =>
  s.min(1, 'An award has a name').max(200, "An award's name can be at most 200 characters");

/** A game's row: one on the wishlist or the shelf. */
export const gameRow = createInsertSchema(games, {
  id: (s) => s.regex(SLUG_RE, "A game's id is lowercase letters, digits and dashes"),
  name: nameOfGame,
  suggestedBy: (s) => s.regex(NAME_RE, "A suggester's name is letters, digits, spaces and . ' -, up to 30"),
  players: (s) => s.min(1, 'Say how many players, or leave it out').max(40, 'Players can be at most 40 characters'),
  minPlayers: players('fewest'),
  maxPlayers: players('most'),
  dur: (s) => s.min(1, 'Say how long it takes, or leave it out').max(40, 'A playing time can be at most 40 characters'),
  minutes: (s) =>
    s
      .int('Minutes are a whole number')
      .min(0, "Minutes can't be negative")
      .max(MINS_MAX, `Minutes are at most ${MINS_MAX}`),
  description: (s) => s.max(DESC_MAX, `A description can be at most ${DESC_MAX} characters`),
  keywords,
  section: section.nullish(),
  expands: nameOfGame,
  video: (s) =>
    s
      .min(1, 'Say what the video searches for, or leave it out')
      .max(200, 'A video search can be at most 200 characters'),
  image: () => image.nullish(),
  bggId,
  year: (s) => s.int('A year is a whole number'),
  createdAt: when,
}).refine((g) => g.minPlayers <= g.maxPlayers, {
  message: "The fewest players can't be more than the most",
  path: ['maxPlayers'],
});

/** A friend's suggestion, or the owner's add, kept after it's decided. */
export const suggestionRow = createInsertSchema(suggestions, {
  id: (s) => s.regex(/^sug-[a-z0-9-]{1,60}$/, "A suggestion's id is sug- then lowercase letters, digits and dashes"),
  gameName: nameOfGame,
  name: (s) => s.regex(NAME_RE, "A suggester's name is letters, digits, spaces and . ' -, up to 30"),
  note: (s) => s.max(NOTE_MAX, `A note can be at most ${NOTE_MAX} characters`),
  gameId: (s) => s.regex(SLUG_RE, "A game's id is lowercase letters, digits and dashes"),
  createdAt: when,
  decidedAt: when,
}).refine((s) => s.decidedAt == null || s.decidedAt >= s.createdAt, {
  message: "A suggestion can't be decided before it was made",
  path: ['decidedAt'],
});

/** One browser's vote for one game. */
export const voteRow = createInsertSchema(votes, {
  gameId: (s) => s.regex(SLUG_RE, "A game's id is lowercase letters, digits and dashes"),
  anonId: (s) => s.regex(ANON_RE, "A browser's id is 8 to 64 letters, digits and dashes"),
});

/** What BoardGameGeek says about a game, by its id. */
export const bggInfoRow = createInsertSchema(bggInfo, {
  bggId,
  name: (s) =>
    s.min(1, 'A game on BoardGameGeek has a name').max(200, "BoardGameGeek's name can be at most 200 characters"),
  summary: (s) => s.max(300, 'A summary can be at most 300 characters'),
  honours: z
    .array(
      z.object({
        name: z.string().min(1, 'An honour has a name').max(200, "An honour's name can be at most 200 characters"),
        year: z.number().int('An honour’s year is a whole number').nullable(),
        result: z.string().min(1, 'An honour has a result').max(40, "An honour's result can be at most 40 characters"),
      }),
    )
    .max(200, 'A game keeps at most 200 honours'),
  weight: (s) => s.min(1, 'A weight is from 1 (light)').max(5, 'A weight is up to 5 (heavy)'),
  honoursFrom: bggId,
  fetchedAt: when,
});

/** A win the owner confirmed that BoardGameGeek doesn't list. */
export const ownerAwardRow = createInsertSchema(ownerAwards, {
  bggId,
  name: awardName,
  year: (s) => s.int('An award’s year is a whole number').min(1900, 'An award’s year is 1900 or later'),
});

/** A rate limit's counter for one key and window. */
export const rateLimitRow = createInsertSchema(rateLimits, {
  key: (s) => s.min(1, 'A counter has a key').max(100, "A counter's key can be at most 100 characters"),
  windowStart: when,
  count: (s) => s.int('A count is a whole number').min(0, "A count can't be negative"),
  expiresAt: when,
});

/**
 * The row `schema` makes of `value`, or an error naming the row (`what`) and
 * every rule it breaks, one per line, for a log to show.
 */
export function checked<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const problems = result.error.issues.map((i) => `  ${i.path.join('.') || '(row)'}: ${i.message}`);
  throw new Error(`${what} can't be saved:\n${problems.join('\n')}`);
}
