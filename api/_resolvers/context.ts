// What every resolver gets: the API's dependencies (Redis, Resend, the
// BoardGameGeek lookup, the rate limiters, Gemini), and per request the
// caller's IP for rate limits, whether the request is a JSON POST, whether
// its cookie names a live owner session, and a way to set a cookie or leave
// work running after the answer.

import { clientIp, rateLimitRefusal, type RateLimiter } from '../_lib/rateLimit.js';
import { isAdmin, isJsonRequest, type Headers, type SessionRedis } from '../_lib/session.js';
import type { AuthDeps } from './auth.js';
import type { ChatDeps } from './chat.js';
import { ApiError } from './errors.js';
import type { SuggestionsDeps } from './suggestions.js';
import type { VotesRedis } from './votes.js';

export interface ApiDeps {
  /** The Upstash client with its default reply parsing, for votes and sessions. */
  redis: VotesRedis & SessionRedis;
  /** Suggestions read through the raw client (getRawRedis), with the mailer and the lookup. */
  suggestions: SuggestionsDeps;
  auth: AuthDeps;
  chat: ChatDeps;
  /** Per-IP limits, each failing open: votes (reads and writes), sign-in links, new suggestions. */
  limiters: { votes: RateLimiter | null; signInLink: RateLimiter | null; suggest: RateLimiter | null };
}

export interface ApiContext {
  deps: ApiDeps;
  headers: Headers;
  /** The caller's IP, for the per-IP limits (clientIp). */
  ip: string;
  /** Whether the request is a POST whose body is JSON, as every owner mutation must be. */
  json: boolean;
  /** Whether the cookie names a live owner session; asked once per request. */
  admin: () => Promise<boolean>;
  setCookie: (value: string) => void;
  /** Keeps work (an email) running after the answer has gone. */
  defer: (work: Promise<void>) => void;
}

/** The request as Yoga hands it over, with the Node request's headers and socket when there is one. */
export interface RequestParts {
  method: string;
  headers: Headers;
  remoteAddress?: string;
  setCookie: (value: string) => void;
  defer: (work: Promise<void>) => void;
}

export function buildContext(deps: ApiDeps, request: RequestParts): ApiContext {
  let admin: Promise<boolean> | undefined;
  return {
    deps,
    headers: request.headers,
    ip: clientIp({ headers: request.headers, socket: { remoteAddress: request.remoteAddress } }),
    json: request.method === 'POST' && isJsonRequest(request.headers),
    admin: () => (admin ??= isAdmin(deps.redis, request.headers)),
    setCookie: request.setCookie,
    defer: request.defer,
  };
}

/**
 * Owner-only operations: a live session, and for anything that mutates, a
 * JSON POST (a CSRF layer behind SameSite; see isJsonRequest).
 */
export async function requireAdmin(ctx: ApiContext, mutation = true): Promise<void> {
  if (mutation && !ctx.json) throw new ApiError(403, 'owner actions must be sent as JSON');
  if (!(await ctx.admin())) throw new ApiError(403, 'owner sign-in required');
}

/** Counts the request against a per-IP limiter, refusing with its 429 when spent. */
export async function limit(ctx: ApiContext, limiter: RateLimiter | null): Promise<void> {
  const refusal = await rateLimitRefusal(limiter, ctx.ip);
  if (refusal) throw new ApiError(refusal.status, refusal.error);
}
