import type { IncomingMessage, ServerResponse } from 'node:http';
import * as Sentry from '@sentry/node';
import { toNodeHandler } from 'better-auth/node';
import { auth, ownerSessionReader } from './_auth.js';
import { lookupGame } from './_lib/bgg.js';
import { isJsonRequest } from './_lib/json.js';
import { ownerEmail, baseUrl, resendMailer } from './_lib/mail.js';
import { getLimiter } from './_lib/rateLimit.js';
import { getRawRedis, getRedis } from './_lib/redis.js';
import { assembleRulesText, streamRulesAnswer } from './_lib/rulesAssistant.js';
import { initSentry, reportError } from './_lib/sentry.js';
import { CHAT_DAILY_LIMIT } from './_resolvers/chat.js';
import type { ApiDeps } from './_resolvers/context.js';
import { createApi, notJson } from './_resolvers/index.js';

initSentry();

// The whole API: one Vercel function serving GraphQL (Yoga) at /api/graphql,
// the schema in _schema.graphql and the resolvers in _resolvers/, and the
// owner's sign-in (Better Auth, _auth.ts) at /api/auth/*, which vercel.json
// rewrites here. This file only wires in the real services: Upstash Redis,
// Resend, BoardGameGeek, Gemini, the rate limiters and the owner check.
// vercel.json gives it the chat's 60 s and the rules text (includeFiles);
// every other operation keeps its own, tighter limit in its resolver.

// Per IP, each failing open: votes (reads and writes, so a loop can't
// inflate counts or grow storage), new suggestions (each sends an email),
// the rules chat (a paid AI call).
const limiters = {
  votes: getLimiter('votes', 30, 60),
  suggest: getLimiter('suggestions', 5, 3600),
};
const chatLimiter = getLimiter('chat', 10, 60);

// Per-IP limits alone don't cap a day's spend (many IPs, or a Redis outage),
// so every caller also shares one daily budget, set well above a busy game
// night. Hard-coded: changing an env var on Vercel needs a redeploy anyway.
// It alone fails closed, so it alone carries the spend guarantee; its short
// Upstash timeout makes an outage refuse in about 2 s rather than 5.
// getLimiter's sliding window counts fixed UTC-day buckets and weights the
// previous day's by how much of it still falls within the last 24 hours, so
// Redis sees roughly "the last 24 hours" and frees questions gradually. But
// Upstash's in-memory cache remembers a refusal until the bucket ends, so a
// warm instance that has refused once keeps refusing until 00:00 UTC without
// asking Redis; only a cold one gets the gradual release. The cache is kept:
// it only ever refuses sooner, never lets an extra question through.
const chatDailyLimiter = getLimiter('chat-global', CHAT_DAILY_LIMIT, 86400, { timeoutMs: 2000 });

// Without the KV env vars the cap is silently off (fine for local dev and
// tests); in production that is a misconfiguration worth hearing about.
if (!chatDailyLimiter && process.env.VERCEL_ENV === 'production') {
  Sentry.captureMessage('chat daily cap disabled: KV env missing', 'warning');
}

let deps: ApiDeps | undefined;

// Built on the first request, not at load: getRedis() throws without the KV
// env vars, which should fail a request (a 500), not the function.
function realDeps(): ApiDeps {
  if (deps) return deps;
  const redis = getRedis();
  const mailer = resendMailer();
  deps = {
    redis,
    suggestions: {
      redis: getRawRedis(),
      mailer,
      baseUrl,
      lookup: (name) => lookupGame(name, process.env.BGG_API_TOKEN, fetch, 6000),
    },
    chat: {
      limiter: chatLimiter,
      dailyLimiter: chatDailyLimiter,
      assembleRulesText,
      streamRulesAnswer,
      apiKey: process.env.GEMINI_API_KEY ?? '',
    },
    limiters,
    ownerSession: ownerSessionReader(auth, ownerEmail),
  };
  return deps;
}

const yoga = createApi(realDeps, { production: process.env.VERCEL_ENV === 'production' });

/** Answers with a status and a GraphQL-shaped error, before Yoga sees the request. */
async function refuse(res: ServerResponse, answer: Response): Promise<void> {
  res.writeHead(answer.status, { 'Content-Type': 'application/json' }).end(await answer.text());
}

/** Whether a request is for Better Auth: its path, as it arrived, starts /api/auth/. */
const isAuthRequest = (req: IncomingMessage) => (req.url ?? '').startsWith('/api/auth/');

/** The answer to a body that isn't valid JSON. */
const badJson = () => Response.json({ errors: [{ message: 'Requests must be valid JSON' }] }, { status: 400 });

/**
 * Hands a sign-in request to Better Auth, which reads its own body and
 * checks its own requests' origin (Google's callback is a GET, and a
 * passkey's steps aren't GraphQL). A body Vercel's getter can't parse is a
 * plain 400, as below; anything else that throws on the way (a missing
 * setting, the database out of reach) is reported and answered with a
 * plain error.
 */
async function signIn(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await toNodeHandler(await auth())(req, res);
  } catch (err) {
    if (err instanceof SyntaxError && !res.headersSent) return refuse(res, badJson());
    await reportError('auth api error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: 'Sign-in failed' }));
    }
  }
}

/**
 * The Node-style handler Vercel calls. Sign-in goes to Better Auth, ahead
 * of the rest. A POST that isn't JSON, or whose JSON doesn't parse, is
 * refused here. It resolves only once work left running after the answer (a
 * suggestion's email) has finished, so the function isn't frozen with it
 * half done.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (isAuthRequest(req)) return signIn(req, res);
  // Every POST must be JSON, judged on the headers as they arrived (see
  // jsonOnly in _resolvers/index.ts for why Yoga's own view isn't enough).
  if (req.method === 'POST' && !isJsonRequest(req.headers)) return refuse(res, notJson());
  // On Vercel `req.body` is a getter that parses the JSON, and throws on a
  // malformed body; Yoga's adapter would answer that with a 500 carrying the
  // stack. Read it once here, so a bad body is a plain 400.
  if (req.method === 'POST') {
    try {
      const body: unknown = Reflect.get(req, 'body');
      void body;
    } catch {
      return refuse(res, badJson());
    }
  }
  const pending: Promise<void>[] = [];
  await yoga(req, res, {
    waitUntil: (work) => {
      if (work) pending.push(work);
    },
  });
  await Promise.allSettled(pending);
}
