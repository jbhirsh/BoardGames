import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as Sentry from '@sentry/node';
import { assembleRulesText, streamRulesAnswer, RULES_ASSISTANT_MAX_OUTPUT_TOKENS } from './_lib/rulesAssistant.js';
import { enforceRateLimit, getLimiter } from './_lib/rateLimit.js';
import { SLUG_RE } from './_lib/slug.js';
import { initSentry, reportError } from './_lib/sentry.js';

initSentry();

// The AI rules assistant. POST { slug, message, history, parts }: reads
// rules-text/<slug>.txt plus the `parts` the rules page names
// (rules-text/<slug>.<part>.txt: every game in a deck, or just the add-on on
// screen, since an expansion's rules on top of the base game's crowd out the
// answer), then the names alone of the game's other rulebooks, so an answer
// can point to the tab that covers a question (_lib/rulesAssistant.ts, which
// the eval harness calls too). Sends that and the recent history to Gemini
// and streams the reply back as plain text. The rules text reaches the
// function through vercel.json's includeFiles.
//
// It validates the slug and each part (SLUG_RE, since they pick a file),
// the message's length, the history's length and total size, and caps
// Gemini's output tokens and time. Per-IP rate limited, and capped at
// CHAT_DAILY_LIMIT questions a day across every caller, checked last so
// per-IP refusals and bad requests don't spend it. It is the only paid API,
// so that cap alone fails closed. It bounds requests, not cost: a budget
// alert on the Gemini project (an owner action in Google Cloud billing,
// outside the code) is the backstop.

// SLUG_RE constrains the slug before it reaches a filesystem path in
// loadRulesText, so it can't traverse out of rules-text/.

// The most earlier messages a question may bring. The rules chat sends
// fewer (RulesChat's HISTORY_SENT), and a test keeps it within this.
export const MAX_HISTORY = 10;

// Cap total history content, not just entry count, so a caller can't smuggle
// megabytes of prompt through it. Sized to fit a legitimate conversation:
// history is capped at MAX_HISTORY entries and each model reply is bounded by
// the output token cap (~4 chars/token), so a real multi-turn chat stays well
// under this while bulk-stuffing is still blocked. (A flat 4000 would reject
// the message right after one full-length answer got echoed back as history.)
const MAX_HISTORY_CONTENT = RULES_ASSISTANT_MAX_OUTPUT_TOKENS * MAX_HISTORY * 4;

// The most rulebooks a request can add: the Card Deck sends all twelve of its
// games' sheets.
const MAX_PARTS = 16;

// Ends a reply Gemini fails partway through: a clean end would read as a
// finished answer. The client renders the reply as Markdown.
const CUT_OFF_NOTE = '\n\n_(Answer cut off — please try again.)_';

// Gemini answers 503 UNAVAILABLE when it is overloaded, usually only for a
// moment: one retry after a short wait turns most of those into an answer.
const RETRY_DELAY_MS = 1000;

// Vercel ends the function at its maxDuration (60 s, vercel.json). Gemini
// gets this much of it, shared by both attempts, so a hung stream ends in the
// error path below (a 500, or the cut-off note) rather than the platform's
// kill. The budget starts after the rate-limit checks, and the 15 s left over
// covers them and Sentry's flush after.
const GEMINI_BUDGET_MS = 45_000;

function isOverloaded(err: unknown): boolean {
  return (err as { status?: unknown } | null)?.status === 503;
}

// Expensive paid AI call, unauthenticated endpoint: bound requests per IP.
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
const CHAT_DAILY_LIMIT = 500;
const chatDailyLimiter = getLimiter('chat-global', CHAT_DAILY_LIMIT, 86400, { timeoutMs: 2000 });

// Without the KV env vars the cap is silently off (fine for local dev and
// tests); in production that is a misconfiguration worth hearing about.
if (!chatDailyLimiter && process.env.VERCEL_ENV === 'production') {
  Sentry.captureMessage('chat daily cap disabled: KV env missing', 'warning');
}

// The client keys its notice on `code`; `error` reads sensibly on its own.
const DAILY_LIMIT_REFUSAL = {
  error: 'The rules assistant has reached its limit for today. The rulebook still works.',
  code: 'daily-limit',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // The per-IP limit fails open like every other endpoint's: in an outage the
  // daily check below refuses anyway, and while Redis is merely slow, failing
  // closed here too would only double the chance of a 503.
  if (!(await enforceRateLimit(chatLimiter, req, res))) return;

  // Vercel leaves body undefined with no payload (and null for a JSON null),
  // which would throw here, outside any try, as a bare 500. Treating it as an
  // empty body sends it through the same 400s as any other bad input.
  const { slug, message, history, parts } = req.body ?? {};

  // Validate slug
  if (!slug || typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    return res.status(400).json({ error: 'slug is required' });
  }

  // Validate the rulebooks of games inside this one to read alongside it.
  // Each picks a file, so it gets the same shape check as slug; a repeat would
  // only resend the same rulebook to a paid model, so none are allowed.
  if (parts !== undefined && (
    !Array.isArray(parts) || parts.length > MAX_PARTS ||
    !parts.every((p) => typeof p === 'string' && SLUG_RE.test(p)) ||
    new Set(parts).size !== parts.length
  )) {
    return res.status(400).json({ error: 'parts must be a list of rulebook names' });
  }

  // Validate message
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (message.length > 500) {
    return res.status(400).json({ error: 'message must be 500 characters or less' });
  }

  // Validate history
  if (history && (!Array.isArray(history) || history.length > MAX_HISTORY)) {
    return res.status(400).json({ error: `history must be an array of ${MAX_HISTORY} or fewer entries` });
  }

  if (Array.isArray(history)) {
    let total = 0;
    for (const entry of history) {
      if (
        !entry || typeof entry !== 'object' ||
        (entry.role !== 'user' && entry.role !== 'model') ||
        typeof entry.content !== 'string'
      ) {
        return res.status(400).json({ error: 'each history entry needs a valid role and string content' });
      }
      total += entry.content.length;
    }
    if (total > MAX_HISTORY_CONTENT) {
      return res.status(400).json({ error: 'history content is too long' });
    }
  }

  // Read rules text
  let rulesText: string;
  try {
    rulesText = assembleRulesText(slug, parts);
  } catch {
    return res.status(404).json({ error: 'Rules not found for this game' });
  }

  // The daily budget is checked last, after the per-IP limit and every 400 or
  // 404, so it counts only questions that will reach Gemini: one abuser's
  // per-IP refusals, or malformed requests, can't burn everyone's budget.
  if (!(await enforceRateLimit(chatDailyLimiter, req, res, {
    key: 'global',
    refusal: DAILY_LIMIT_REFUSAL,
    // If Redis can't answer, nothing would cap spend.
    failClosed: true,
  }))) return;

  Sentry.setTag("game_slug", slug);
  Sentry.setContext("chat", { slug, messageLength: message.length, historyLength: history?.length ?? 0 });

  // Set once the first chunk is written: the 200 and its headers are then on
  // the wire, so a later failure can only end the response with a note.
  let streaming = false;
  let retried = false;
  const deadline = Date.now() + GEMINI_BUDGET_MS;
  for (;;) {
    try {
      const response = await streamRulesAnswer({
        rulesText,
        message,
        history,
        apiKey: process.env.GEMINI_API_KEY!,
        timeoutMs: Math.max(0, deadline - Date.now()),
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');

      for await (const chunk of response) {
        const text = chunk.text;
        if (text) {
          res.write(text);
          streaming = true;
        }
      }

      res.end();
      return;
    } catch (err) {
      // Nothing is on the wire yet, so a retry is invisible to the reader.
      if (!retried && !streaming && isOverloaded(err)) {
        retried = true;
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      await reportError('Gemini API error:', err);
      if (streaming) {
        res.end(CUT_OFF_NOTE);
        return;
      }
      return res.status(500).json({ error: 'Failed to generate response' });
    }
  }
}
