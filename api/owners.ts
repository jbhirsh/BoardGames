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

// A display name friends type once: letters, digits, spaces and a few
// punctuation marks, 1–30 chars. Rejects control characters and markup.
// Mirrored client-side in src/utils/displayName.ts; keep them identical.
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,29}$/u;

// One hash per game, field = anonymous browser id, value = display name.
// Collection slugs and wishlist ids share this namespace on purpose (one
// fetch covers a page of both); src/__tests__/ownableIds.test.ts guarantees
// they never collide.
const ownersKey = (id: string) => `owners:${id}`;

export interface OwnersPipeline {
  hgetall(key: string): OwnersPipeline;
  exec(): Promise<unknown[]>;
}

export interface OwnersRedis {
  hset(key: string, fields: Record<string, string>): Promise<number>;
  hdel(key: string, field: string): Promise<number>;
  hgetall(key: string): Promise<Record<string, unknown> | null>;
  pipeline(): OwnersPipeline;
}

export interface OwnersRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface OwnersResponse {
  status(code: number): OwnersResponse;
  json(data: unknown): OwnersResponse;
}

// @upstash/redis JSON-parses hash values on read, so a name like "2024" or
// "null" comes back as a number or null; String() restores what was stored.
function namesOf(hash: unknown): string[] {
  if (!hash || typeof hash !== 'object') return [];
  return Object.values(hash as Record<string, unknown>)
    .filter((v) => v !== undefined)
    .map((v) => String(v))
    .sort((a, b) => a.localeCompare(b));
}

function hasField(hash: unknown, field: string): boolean {
  return !!hash && typeof hash === 'object' && field in (hash as Record<string, unknown>);
}

export async function handleOwners(
  redis: OwnersRedis,
  req: OwnersRequest,
  res: OwnersResponse,
): Promise<OwnersResponse> {
  try {
    if (req.method === 'GET') {
      const parsed = parseIds(req.query.ids);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const { ids } = parsed;
      const anonId = optionalAnonId(req.query.anonId);

      const pipe = redis.pipeline();
      for (const id of ids) pipe.hgetall(ownersKey(id));
      const hashes = await pipe.exec();

      const owners: Record<string, string[]> = {};
      const mine: string[] = [];
      ids.forEach((id, i) => {
        owners[id] = namesOf(hashes[i]);
        if (anonId && hasField(hashes[i], anonId)) mine.push(id);
      });
      return res.status(200).json({ owners, mine });
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as {
        itemId?: unknown;
        anonId?: unknown;
        name?: unknown;
        own?: unknown;
      };
      const { itemId, anonId, name, own } = body;

      if (typeof itemId !== 'string' || !SLUG_RE.test(itemId)) {
        return res.status(400).json({ error: 'invalid itemId' });
      }
      if (typeof anonId !== 'string' || !ANON_RE.test(anonId)) {
        return res.status(400).json({ error: 'invalid anonId' });
      }
      if (own !== 0 && own !== 1) {
        return res.status(400).json({ error: 'own must be 0 or 1' });
      }
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (own === 1 && !NAME_RE.test(trimmed)) {
        return res.status(400).json({ error: 'name must be 1–30 letters, digits, spaces or basic punctuation' });
      }

      if (own === 1) {
        await redis.hset(ownersKey(itemId), { [anonId]: trimmed });
      } else {
        await redis.hdel(ownersKey(itemId), anonId);
      }
      const hash = await redis.hgetall(ownersKey(itemId));
      return res.status(200).json({ itemId, owners: namesOf(hash), mine: own === 1 });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error('owners api error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Reads are one request per page load; writes are one per click, and a friend
// cataloguing their shelf can click dozens of cards in a minute, so the two
// get separate per-IP budgets. Writes are still bounded so a loop can't fill
// hashes with junk names without limit.
const readLimiter = getLimiter('owners-read', 30, 60);
const writeLimiter = getLimiter('owners-write', 120, 60);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const limiter = req.method === 'POST' ? writeLimiter : readLimiter;
  if (!(await enforceRateLimit(limiter, req, res))) return;
  await handleOwners(getRedis(), req, res);
}
