// Anonymous wishlist voting on Upstash Redis (Query.wishlistVotes,
// Mutation.vote). Votes are Redis sets keyed wishlist:votes:<id>, deduped by
// an anonymous browser id: wishlistVotes reads the counts (and this
// browser's own votes, given its id), vote adds or takes back one. A vote
// must name a real entry (isVotable); reading isn't filtered, as scard never
// creates a key. Both are bounded per IP (the resolvers, api/_resolvers/index.ts)
// so a loop can't inflate counts or grow storage without limit. Written
// against small interfaces (VotesRedis) so tests drive it with a fake Redis.

import { SLUG_RE, isSuggestionId } from '../_lib/slug.js';
import { ANON_RE, parseIdList, optionalAnonId } from '../_lib/ids.js';
import { WISHLIST_IDS } from '../_lib/wishlistIds.js';
import { ApiError } from './errors.js';

const voteKey = (id: string) => `wishlist:votes:${id}`;
// The suggestion hash api/_resolvers/suggestions.ts keeps per id; only an
// approved one is on the public wishlist.
const suggestionKey = (id: string) => `suggestions:${id}`;

export interface VotesPipeline {
  scard(key: string): VotesPipeline;
  sismember(key: string, member: string): VotesPipeline;
  exec(): Promise<unknown[]>;
}

export interface VotesRedis {
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  scard(key: string): Promise<number>;
  hget(key: string, field: string): Promise<unknown>;
  pipeline(): VotesPipeline;
}

// A vote set has no TTL, so a vote for a made-up id would leave a key behind
// for good: only the compiled-in wishlist and approved suggestions take votes.
async function isVotable(redis: VotesRedis, id: string): Promise<boolean> {
  if (WISHLIST_IDS.has(id)) return true;
  if (!isSuggestionId(id)) return false;
  return (await redis.hget(suggestionKey(id), 'status')) === 'approved';
}

export interface Votes {
  counts: Array<{ id: string; count: number }>;
  myVotes: string[];
}

/** The vote counts for `ids`, and which of them `anonId` (ignored when malformed) voted for. */
export async function readVotes(redis: VotesRedis, rawIds: readonly string[], rawAnonId: unknown): Promise<Votes> {
  const parsed = parseIdList(rawIds);
  if (!parsed.ok) throw new ApiError(400, parsed.error);
  const { ids } = parsed;
  const anonId = optionalAnonId(rawAnonId);

  const pipe = redis.pipeline();
  for (const id of ids) pipe.scard(voteKey(id));
  if (anonId) {
    for (const id of ids) pipe.sismember(voteKey(id), anonId);
  }
  const pipeResult = await pipe.exec();

  const counts = ids.map((id, i) => ({ id, count: Number(pipeResult[i]) || 0 }));
  const myVotes = anonId ? ids.filter((_, i) => Number(pipeResult[ids.length + i]) === 1) : [];
  return { counts, myVotes };
}

export interface VoteInput {
  itemId: unknown;
  anonId: unknown;
  vote: unknown;
}

/** Adds (1) or takes back (0) one browser's vote, answering the entry's new count. */
export async function castVote(
  redis: VotesRedis,
  { itemId, anonId, vote }: VoteInput,
): Promise<{ itemId: string; count: number; myVote: 0 | 1 }> {
  if (typeof itemId !== 'string' || !SLUG_RE.test(itemId)) throw new ApiError(400, 'invalid itemId');
  if (typeof anonId !== 'string' || !ANON_RE.test(anonId)) throw new ApiError(400, 'invalid anonId');
  if (vote !== 0 && vote !== 1) throw new ApiError(400, 'vote must be 0 or 1');
  if (!(await isVotable(redis, itemId))) throw new ApiError(404, 'unknown itemId');

  if (vote === 1) await redis.sadd(voteKey(itemId), anonId);
  else await redis.srem(voteKey(itemId), anonId);
  const count = await redis.scard(voteKey(itemId));
  return { itemId, count, myVote: vote };
}
