import type { IncomingMessage, ServerResponse } from 'node:http';
import * as Sentry from '@sentry/node';
import { lookupGame } from './_lib/bgg.js';
import { ownerEmail, baseUrl, resendMailer } from './_lib/mail.js';
import { getLimiter } from './_lib/rateLimit.js';
import { getRawRedis, getRedis } from './_lib/redis.js';
import { assembleRulesText, streamRulesAnswer } from './_lib/rulesAssistant.js';
import { initSentry } from './_lib/sentry.js';
import { CHAT_DAILY_LIMIT } from './_resolvers/chat.js';
import type { ApiDeps } from './_resolvers/context.js';
import { createApi, notJson } from './_resolvers/index.js';
import { isJsonRequest } from './_lib/session.js';

initSentry();

// The whole API: one Vercel function serving GraphQL (Yoga) at /api/graphql,
// the schema in _schema.graphql and the resolvers in _resolvers/. This file
// only wires in the real services: Upstash Redis, Resend, BoardGameGeek,
// Gemini and the rate limiters. vercel.json gives it the chat's 60 s and
// the rules text (includeFiles); every other operation keeps its own,
// tighter limit in its resolver.

// Per IP, each failing open: votes (reads and writes, so a loop can't
// inflate counts or grow storage), sign-in links and new suggestions (each
// sends an email), the rules chat (a paid AI call).
const limiters = {
  votes: getLimiter('votes', 30, 60),
  signInLink: getLimiter('auth', 5, 3600),
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
    auth: { redis, mailer, ownerEmail: ownerEmail(), baseUrl },
    chat: {
      limiter: chatLimiter,
      dailyLimiter: chatDailyLimiter,
      assembleRulesText,
      streamRulesAnswer,
      apiKey: process.env.GEMINI_API_KEY ?? '',
    },
    limiters,
  };
  return deps;
}

const yoga = createApi(realDeps, { production: process.env.VERCEL_ENV === 'production' });

/** Answers with a status and a GraphQL-shaped error, before Yoga sees the request. */
async function refuse(res: ServerResponse, answer: Response): Promise<void> {
  res.writeHead(answer.status, { 'Content-Type': 'application/json' }).end(await answer.text());
}

/**
 * The Node-style handler Vercel calls. A POST that isn't JSON, or whose
 * JSON doesn't parse, is refused here. It resolves only once work left
 * running after the answer (a sign-in email) has finished, so the function
 * isn't frozen with it half done.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
      return refuse(res, Response.json({ errors: [{ message: 'Requests must be valid JSON' }] }, { status: 400 }));
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
