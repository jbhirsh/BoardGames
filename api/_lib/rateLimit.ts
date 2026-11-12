// Per-IP rate limiting, and the rules chat's daily budget, as counters in
// the API's database (the `rate_limits` table, api/_db/schema.ts): one row
// per key and fixed window, counted by one INSERT … ON CONFLICT DO UPDATE …
// RETURNING per request. A fixed window lets up to twice a limit through
// around its boundary (the daily cap's is midnight UTC); that's accepted, as
// each limit only caps abuse or spend. Expired rows are swept on about one
// request in 50, after the answer.
//
// FAIL-OPEN by default: when no database is configured (local dev, tests)
// or a count throws, the request is allowed. A rate limiter must never
// become a new way to take the whole API down; its only job is to cap
// abuse, so when in doubt it yields to availability. The one exception opts
// in with `failClosed`: the rules assistant's daily budget, where an
// unbounded outage would mean unbounded spend on a paid model (#189). libSQL
// has no request timeout of its own, so a limiter given `timeoutMs` races
// the count against it, and a fail-closed limiter in a production deployment
// with no database is built all the same, which throws, so the cap refuses.

import * as Sentry from '@sentry/node';
import { lt, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { database } from '../_db/client.js';
import { connection } from '../_db/connection.js';
import { rateLimits } from '../_db/schema.js';

/** What rateLimitRefusal needs: counts one request under a key, answering whether it may go ahead. */
export interface RateLimiter {
  limit(key: string, defer?: (work: Promise<void>) => void): Promise<{ success: boolean }>;
}

export interface RateLimitOptions {
  /** The 429's message and code, for an operation that words its own refusal. */
  refusal?: { error: string; code?: string };
  /** Refuse with a 503 when the limiter can't answer, instead of allowing. */
  failClosed?: boolean;
  /** Keeps the limiter's sweep running after the answer (the request's waitUntil). */
  defer?: (work: Promise<void>) => void;
}

interface MinimalReq {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
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

/** Why a request was turned away: the status and body to answer with. */
export interface Refusal {
  status: 429 | 503;
  error: string;
  code?: string;
}

/**
 * Counts one request against `limiter` under `key` (the client IP, or a
 * fixed key for a shared budget). Returns null when it may proceed, or the
 * refusal: a 429, or, failing closed, a 503. A null limiter (env not
 * configured) allows the request; so does a thrown limit() call, unless
 * `failClosed` is set.
 */
export async function rateLimitRefusal(
  limiter: RateLimiter | null,
  key: string,
  options: RateLimitOptions = {},
): Promise<Refusal | null> {
  if (!limiter) return null;
  try {
    const { success } = await limiter.limit(key, options.defer);
    if (!success) return { status: 429, ...(options.refusal ?? { error: 'Too many requests. Please slow down.' }) };
    return null;
  } catch (err) {
    // The database out of reach, or slower than the limiter's timeout.
    // Fail-open callers don't punish legitimate traffic for a limiter fault,
    // but surface it: a silent fail-open means limits quietly stop
    // enforcing with no signal otherwise.
    //
    // Fire-and-forget on purpose: do NOT await a flush here. This path runs
    // only while the database is unhealthy, which produces a stream of
    // requests, not one; awaiting flush(2000) on each would slow all traffic
    // for the whole outage, the opposite of fail-open's goal. The reused
    // Fluid Compute container still delivers the event across later
    // invocations, and Sentry aggregates the repeats.
    Sentry.captureException(err);
    if (options.failClosed) return { status: 503, error: 'Temporarily unavailable. Please try again later.' };
    return null;
  }
}

/** How often a count also sweeps expired rows: about one request in 50. */
const SWEEP_CHANCE = 1 / 50;

export interface CounterOptions {
  /** Refuse to wait longer than this for the count: it then throws, as a database error would. */
  timeoutMs?: number;
  now?: () => number;
  /** Whether this count also sweeps; random by default. */
  sweep?: () => boolean;
}

/** `work`, or a rejection once `ms` have passed. The work itself isn't cancelled: libSQL can't be. */
function within<T>(work: Promise<T>, ms: number | undefined): Promise<T> {
  if (ms === undefined) return work;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`rate limiter timed out after ${ms} ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * A fixed-window counter over `rate_limits`: `requests` per `windowSeconds`
 * for each key, prefixed so different limits count apart. The window starts
 * at a multiple of its length since the epoch, so a day's is a UTC day.
 */
export function counterLimiter(
  db: () => Promise<LibSQLDatabase>,
  prefix: string,
  requests: number,
  windowSeconds: number,
  options: CounterOptions = {},
): RateLimiter {
  const windowMs = windowSeconds * 1000;
  const now = options.now ?? Date.now;
  const sweep = options.sweep ?? (() => Math.random() < SWEEP_CHANCE);
  return {
    async limit(key, defer) {
      const at = now();
      const windowStart = Math.floor(at / windowMs) * windowMs;
      const count = async () => {
        const d = await db();
        const [row] = await d
          .insert(rateLimits)
          .values({ key: `${prefix}:${key}`, windowStart, count: 1, expiresAt: windowStart + windowMs })
          .onConflictDoUpdate({
            target: [rateLimits.key, rateLimits.windowStart],
            set: { count: sql`${rateLimits.count} + 1` },
          })
          .returning({ count: rateLimits.count });
        if (defer && sweep()) {
          defer(
            d
              .delete(rateLimits)
              .where(lt(rateLimits.expiresAt, at))
              .then(
                () => undefined,
                (err: unknown) => void Sentry.captureException(err),
              ),
          );
        }
        return row.count;
      };
      return { success: (await within(count(), options.timeoutMs)) <= requests };
    },
  };
}

const cache = new Map<string, RateLimiter | null>();

/**
 * Builds (and memoizes) a limiter on this deployment's database, or returns
 * null where no database is configured (local dev, tests), so callers fail
 * open; a `failClosed` one in production gets a limiter all the same, which
 * throws, so its caller refuses. `prefix` keeps different endpoints' counts
 * apart. `timeoutMs` bounds the wait, for a fail-closed caller that should
 * refuse quickly in an outage.
 */
export function getLimiter(
  prefix: string,
  requests: number,
  windowSeconds: number,
  options: { timeoutMs?: number; failClosed?: boolean } = {},
  env: Record<string, string | undefined> = process.env,
): RateLimiter | null {
  // Key the cache on the full budget, not just prefix, so reusing a prefix with
  // a different budget can't silently hand back the first caller's limiter.
  const cacheKey = `${prefix}:${requests}:${windowSeconds}:${options.timeoutMs}:${options.failClosed}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;
  const limiter =
    connection(env) || (options.failClosed && env.VERCEL_ENV === 'production')
      ? counterLimiter(() => database(env), prefix, requests, windowSeconds, options)
      : null;
  cache.set(cacheKey, limiter);
  return limiter;
}
