import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ANON_RE = /^[a-zA-Z0-9-]{8,64}$/;

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
      const idsRaw = typeof req.query.ids === 'string' ? req.query.ids : '';
      if (idsRaw.length === 0) {
        return res.status(400).json({ error: 'ids query parameter is required' });
      }
      const ids = idsRaw.split(',').map((s) => s.trim()).filter((s) => ID_RE.test(s));
      if (ids.length === 0) {
        return res.status(400).json({ error: 'ids must contain at least one valid slug (lowercase alphanumeric + hyphens)' });
      }
      if (ids.length > 100) {
        return res.status(400).json({ error: 'too many ids (max 100)' });
      }

      const anonRaw = typeof req.query.anonId === 'string' ? req.query.anonId : '';
      const anonId = ANON_RE.test(anonRaw) ? anonRaw : null;

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

      if (typeof itemId !== 'string' || !ID_RE.test(itemId)) {
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
    console.error('votes api error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

let cached: Redis | null = null;
function defaultRedis(): Redis {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN must be set');
  }
  cached = new Redis({ url, token });
  return cached;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleVotes(defaultRedis(), req, res);
}
