// Per-IP rate limiting for the serverless endpoints, backed by the same
// Upstash Redis instance the votes feature already uses. Kept small and
// dependency-injectable so the enforcement logic is unit-testable without a
// real Redis.
//
// Design: FAIL-OPEN. If the limiter env vars are absent (local dev, tests) or
// a limit() call throws (Redis blip), the request is allowed. A rate limiter
// must never become a new way to take the whole API down — its only job is to
// cap abuse, so when in doubt it yields to availability.

import * as Sentry from '@sentry/node';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/** Minimal shape of what enforceRateLimit needs — satisfied by @upstash/ratelimit. */
export interface RateLimiter {
  limit(identifier: string): Promise<{ success: boolean }>;
}

interface MinimalReq {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

interface MinimalRes {
  status(code: number): MinimalRes;
  json(body: unknown): MinimalRes;
}

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[v.length - 1] : v;
}

/**
 * Best-effort client IP for rate-limit bucketing. Must use a value the caller
 * can't set, or the per-IP limit is trivially bypassed by rotating a fake IP.
 * Prefer x-real-ip (Vercel sets it to the single true client IP); for
 * x-forwarded-for take the LAST hop — the entry appended by Vercel's trusted
 * edge — not the client-most first entry (in a standard proxy chain that first
 * entry is caller-supplied). Vercel also overwrites x-forwarded-for at its edge
 * to block spoofing on non-Enterprise projects, so this is defense in depth.
 * Falls back to a shared 'unknown' bucket so IP-less requests are still
 * collectively bounded rather than exempt.
 */
export function clientIp(req: MinimalReq): string {
  const realIp = headerValue(req.headers['x-real-ip'])?.trim();
  if (realIp) return realIp;
  const fwd = headerValue(req.headers['x-forwarded-for']);
  const last = fwd?.split(',').pop()?.trim();
  return last || req.socket?.remoteAddress || 'unknown';
}

/**
 * Enforce a limit for this request. Returns true if the request may proceed.
 * When it returns false it has already written a 429. A null limiter (env not
 * configured) or a thrown limit() call fails open (returns true).
 */
export async function enforceRateLimit(
  limiter: RateLimiter | null,
  req: MinimalReq,
  res: MinimalRes,
): Promise<boolean> {
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit(clientIp(req));
    if (!success) {
      res.status(429).json({ error: 'Too many requests. Please slow down.' });
      return false;
    }
    return true;
  } catch (err) {
    // Redis unreachable — don't punish legitimate traffic for a limiter fault,
    // but surface it: a silent fail-open means limits quietly stop enforcing
    // (bad token, network partition, API change) with no signal otherwise.
    //
    // Fire-and-forget on purpose — do NOT await a flush here. This path runs
    // only while Redis is unhealthy, which produces a stream of requests, not
    // one; awaiting flush(2000) on each would slow all traffic for the whole
    // outage, the opposite of fail-open's goal. The reused Fluid Compute
    // container still delivers the event across later invocations, and Sentry
    // aggregates the repeats. (The 500 paths in chat.ts/votes.ts flush because
    // they are terminal and low-frequency; this is the fast path.)
    Sentry.captureException(err);
    return true;
  }
}

const cache = new Map<string, Ratelimit | null>();

/**
 * Build (and memoize) a sliding-window limiter, or return null when the
 * Upstash env vars are absent so callers fail open. `prefix` namespaces the
 * Redis keys so different endpoints get independent budgets.
 */
export function getLimiter(prefix: string, requests: number, windowSeconds: number): RateLimiter | null {
  // Key the cache on the full budget, not just prefix, so reusing a prefix with
  // a different budget can't silently hand back the first caller's limiter.
  const cacheKey = `${prefix}:${requests}:${windowSeconds}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    cache.set(cacheKey, null);
    return null;
  }
  const limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
    prefix: `ratelimit:${prefix}`,
  });
  cache.set(cacheKey, limiter);
  return limiter;
}
