import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as Sentry from '@sentry/node';
import { enforceRateLimit, getLimiter } from './_lib/rateLimit.js';
import { SLUG_RE } from './_lib/slug.js';
import { ANON_RE, parseIds, optionalAnonId } from './_lib/ids.js';
import { getRedis } from './_lib/redis.js';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

const voteKey = (id: string) => `wishlist:votes:${id}`;

export interface VotesPipeline {
  scard(key: string): VotesPipeline;
  sismember(key: string, member: string): VotesPipeline;
  exec(): Promise<unknown[]>;
}

export interface VotesRedis {
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  scard(key: string): Promise<number>;
  pipeline(): VotesPipeline;
}

export interface VotesRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface VotesResponse {
  status(code: number): VotesResponse;
  json(data: unknown): VotesResponse;
}

export async function handleVotes(
  redis: VotesRedis,
  req: VotesRequest,
  res: VotesResponse,
): Promise<VotesResponse> {
  try {
    if (req.method === 'GET') {
      const parsed = parseIds(req.query.ids);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const { ids } = parsed;
      const anonId = optionalAnonId(req.query.anonId);

      const pipe = redis.pipeline();
      for (const id of ids) pipe.scard(voteKey(id));
      if (anonId) {
        for (const id of ids) pipe.sismember(voteKey(id), anonId);
      }
      const pipeResult = await pipe.exec();

      const counts: Record<string, number> = {};
      ids.forEach((id, i) => {
        counts[id] = Number(pipeResult[i]) || 0;
      });
      const myVotes = anonId
        ? ids.filter((_, i) => Number(pipeResult[ids.length + i]) === 1)
        : [];

      return res.status(200).json({ counts, myVotes });
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as {
        itemId?: unknown;
        anonId?: unknown;
        vote?: unknown;
      };
      const { itemId, anonId, vote } = body;

      if (typeof itemId !== 'string' || !SLUG_RE.test(itemId)) {
        return res.status(400).json({ error: 'invalid itemId' });
      }
      if (typeof anonId !== 'string' || !ANON_RE.test(anonId)) {
        return res.status(400).json({ error: 'invalid anonId' });
      }
      if (vote !== 0 && vote !== 1) {
        return res.status(400).json({ error: 'vote must be 0 or 1' });
      }

      if (vote === 1) {
        await redis.sadd(voteKey(itemId), anonId);
      } else {
        await redis.srem(voteKey(itemId), anonId);
      }
      const count = await redis.scard(voteKey(itemId));
      return res.status(200).json({ itemId, count, myVote: vote });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error('votes api error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Unauthenticated writes to Redis (sadd grows a set per unique anonId): bound
// per IP so a loop can't inflate counts or grow storage without limit.
const votesLimiter = getLimiter('votes', 30, 60);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await enforceRateLimit(votesLimiter, req, res))) return;
  await handleVotes(getRedis(), req, res);
}
