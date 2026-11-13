// What every resolver gets: the API's dependencies (the database, Resend, the
// BoardGameGeek lookup, the rate limiters, Gemini, the owner check), and per
// request the caller's IP for rate limits, whether the request is a JSON
// POST, whether its session is the owner's, and a way to set a cookie or
// leave work running after the answer.

import { isJsonRequest, type Headers } from '../_lib/json.js';
import { clientIp, rateLimitRefusal, type RateLimiter } from '../_lib/rateLimit.js';
import type { ChatDeps } from './chat.js';
import { ApiError } from './errors.js';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { SuggestionsDeps } from './suggestions.js';

/** Whether a request's session is the owner's, and the cookies that renew it (api/_auth.ts). */
export interface OwnerSession {
  owner: boolean;
  setCookies?: string[];
}

export interface ApiDeps {
  /** The deployment's database (api/_db/client.ts), checked on first use. */
  db: () => Promise<LibSQLDatabase>;
  /** The wishlist and suggestions: the database, the mailer and BoardGameGeek. */
  suggestions: SuggestionsDeps;
  chat: ChatDeps;
  /** Per-IP limits, each failing open: votes (reads and writes), new suggestions. */
  limiters: { votes: RateLimiter | null; suggest: RateLimiter | null };
  /** Reads whether a request's session is the owner's (ownerSessionReader in api/_auth.ts; a fake in tests). */
  ownerSession: (headers: Headers) => Promise<OwnerSession>;
}

export interface ApiContext {
  deps: ApiDeps;
  headers: Headers;
  /** The caller's IP, for the per-IP limits (clientIp). */
  ip: string;
  /** Whether the request is a POST whose body is JSON, as every owner mutation must be. */
  json: boolean;
  /** Whether the session is the owner's; asked once per request, its renewed cookie set as it's read. */
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
    admin: () =>
      (admin ??= deps.ownerSession(request.headers).then(({ owner, setCookies = [] }) => {
        for (const value of setCookies) request.setCookie(value);
        return owner;
      })),
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
  const refusal = await rateLimitRefusal(limiter, ctx.ip, { defer: ctx.defer });
  if (refusal) throw new ApiError(refusal.status, refusal.error);
}
