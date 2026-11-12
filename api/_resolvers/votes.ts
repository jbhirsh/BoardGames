// Anonymous wishlist voting (Query.wishlistVotes, Mutation.vote), in the
// `votes` table: one row per (game, browser), the browser known by an
// anonymous id it keeps for itself. wishlistVotes reads the counts (and
// this browser's own votes, given its id), vote adds or takes back one. A
// vote must name a game on the wishlist; reading isn't filtered, as an id
// with no votes simply counts 0. Both are bounded per IP (the resolvers,
// api/_resolvers/index.ts) so a loop can't inflate counts or grow storage
// without limit.

import { and, count, eq, inArray } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { SLUG_RE } from '../_lib/slug.js';
import { ANON_RE, parseIdList, optionalAnonId } from '../_lib/ids.js';
import { games, votes } from '../_db/schema.js';
import { ApiError } from './errors.js';

export interface Votes {
  counts: Array<{ id: string; count: number }>;
  myVotes: string[];
}

/** The vote counts for `ids`, and which of them `anonId` (ignored when malformed) voted for. */
export async function readVotes(db: LibSQLDatabase, rawIds: readonly string[], rawAnonId: unknown): Promise<Votes> {
  const parsed = parseIdList(rawIds);
  if (!parsed.ok) throw new ApiError(400, parsed.error);
  const ids = [...new Set(parsed.ids)];
  const anonId = optionalAnonId(rawAnonId);
  const counted = await db
    .select({ id: votes.gameId, count: count() })
    .from(votes)
    .where(inArray(votes.gameId, ids))
    .groupBy(votes.gameId);
  const countOf = new Map(counted.map((c) => [c.id, c.count]));
  const mine = anonId
    ? await db
        .select({ id: votes.gameId })
        .from(votes)
        .where(and(inArray(votes.gameId, ids), eq(votes.anonId, anonId)))
    : [];
  const voted = new Set(mine.map((m) => m.id));
  return { counts: ids.map((id) => ({ id, count: countOf.get(id) ?? 0 })), myVotes: ids.filter((id) => voted.has(id)) };
}

export interface VoteInput {
  itemId: unknown;
  anonId: unknown;
  vote: unknown;
}

/** Adds (1) or takes back (0) one browser's vote, answering the game's new count. */
export async function castVote(
  db: LibSQLDatabase,
  { itemId, anonId, vote }: VoteInput,
): Promise<{ itemId: string; count: number; myVote: 0 | 1 }> {
  if (typeof itemId !== 'string' || !SLUG_RE.test(itemId)) throw new ApiError(400, 'invalid itemId');
  if (typeof anonId !== 'string' || !ANON_RE.test(anonId)) throw new ApiError(400, 'invalid anonId');
  if (vote !== 0 && vote !== 1) throw new ApiError(400, 'vote must be 0 or 1');
  const [game] = await db
    .select({ id: games.id })
    .from(games)
    .where(and(eq(games.id, itemId), eq(games.status, 'wanted')));
  if (!game) throw new ApiError(404, 'unknown itemId');

  if (vote === 1) await db.insert(votes).values({ gameId: itemId, anonId }).onConflictDoNothing();
  else await db.delete(votes).where(and(eq(votes.gameId, itemId), eq(votes.anonId, anonId)));
  const [{ n }] = await db.select({ n: count() }).from(votes).where(eq(votes.gameId, itemId));
  return { itemId, count: n, myVote: vote };
}
