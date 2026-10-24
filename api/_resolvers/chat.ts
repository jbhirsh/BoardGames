// The AI rules assistant (Subscription.askRules, streamed over server-sent
// events). It reads rules-text/<slug>.txt plus the `parts` the rules page
// names (rules-text/<slug>.<part>.txt: every game in a deck, or just the
// add-on on screen, since an expansion's rules on top of the base game's
// crowd out the answer), then the names alone of the game's other
// rulebooks, so an answer can point to the tab that covers a question
// (_lib/rulesAssistant.ts, which the eval harness calls too). Sends that and
// the recent history to Gemini and streams the reply back one text chunk
// per event. The rules text reaches the function through vercel.json's
// includeFiles.
//
// It validates the slug and each part (SLUG_RE, since they pick a file),
// the message's length, the history's length and total size, and caps
// Gemini's output tokens and time. Per-IP rate limited, and capped at
// CHAT_DAILY_LIMIT questions a day across every caller, checked last so
// per-IP refusals and bad requests don't spend it. It is the only paid API,
// so that cap alone fails closed. It bounds requests, not cost: a budget
// alert on the Gemini project (an owner action in Google Cloud billing,
// outside the code) is the backstop.
//
// Every refusal, and a Gemini failure before the first chunk, comes before
// the stream starts, so it answers with its status (400, 404, 429, 500,
// 503) and one error event, as the old endpoint answered with a status and
// JSON: askRules waits for the first chunk before handing the stream over.

import * as Sentry from '@sentry/node';
import {
  RULES_ASSISTANT_MAX_OUTPUT_TOKENS,
  type ChatHistoryEntry,
  type StreamRulesAnswerOptions,
} from '../_lib/rulesAssistant.js';
import { rateLimitRefusal, type RateLimiter } from '../_lib/rateLimit.js';
import { SLUG_RE } from '../_lib/slug.js';
import { reportError } from '../_lib/sentry.js';
import { ApiError } from './errors.js';

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

/** How many questions a day every caller shares; see api/graphql.ts, which builds the limiter. */
export const CHAT_DAILY_LIMIT = 500;

// The client keys its notice on the code; the message reads sensibly on its own.
const DAILY_LIMIT_REFUSAL = {
  error: 'The rules assistant has reached its limit for today. The rulebook still works.',
  code: 'DAILY_LIMIT',
};

/** One streamed piece of Gemini's answer. */
interface AnswerChunk {
  text?: string;
}

export interface ChatDeps {
  /** Per IP, failing open. */
  limiter: RateLimiter | null;
  /** The shared daily budget, failing closed. */
  dailyLimiter: RateLimiter | null;
  assembleRulesText: (slug: string, parts?: string[]) => string;
  streamRulesAnswer: (options: StreamRulesAnswerOptions) => Promise<AsyncIterable<AnswerChunk>>;
  apiKey: string;
  /** Test seams for the retry's wait and Gemini's share of the time. */
  retryDelayMs?: number;
  budgetMs?: number;
}

export interface AskRulesInput {
  slug: string;
  message: string;
  history?: readonly unknown[] | null;
  parts?: readonly unknown[] | null;
}

function isOverloaded(err: unknown): boolean {
  return (err as { status?: unknown } | null)?.status === 503;
}

/** Distinct rulebook names, each shaped like a slug, at most MAX_PARTS of them. */
function isRulebookList(list: readonly unknown[]): list is string[] {
  return (
    list.length <= MAX_PARTS &&
    list.every((p) => typeof p === 'string' && SLUG_RE.test(p)) &&
    new Set(list).size === list.length
  );
}

/** A history entry as the rules page sends one: a role and its text. */
function isHistoryEntry(v: unknown): v is ChatHistoryEntry {
  if (typeof v !== 'object' || v === null) return false;
  const { role, content }: { role?: unknown; content?: unknown } = v;
  return (role === 'user' || role === 'model') && typeof content === 'string';
}

/** The history checked entry by entry and in total, or the 400 it gets. */
function checkHistory(sent: readonly unknown[] | null | undefined): ChatHistoryEntry[] | undefined {
  if (!sent) return undefined;
  if (sent.length > MAX_HISTORY) throw new ApiError(400, `history must be an array of ${MAX_HISTORY} or fewer entries`);
  const history: ChatHistoryEntry[] = [];
  let total = 0;
  for (const entry of sent) {
    if (!isHistoryEntry(entry)) throw new ApiError(400, 'each history entry needs a valid role and string content');
    history.push(entry);
    total += entry.content.length;
  }
  if (total > MAX_HISTORY_CONTENT) throw new ApiError(400, 'history content is too long');
  return history;
}

const refuse = (refusal: { status: number; error: string; code?: string }) =>
  new ApiError(refusal.status, refusal.error, refusal.code ? { code: refusal.code } : {});

/**
 * Checks a question and opens Gemini's answer, resolving once its first
 * chunk is in (or the answer turns out empty) to the stream of text chunks.
 * Every refusal before that throws an ApiError; so does a Gemini failure,
 * after one retry when it was overloaded. A failure once chunks are flowing
 * ends the stream with CUT_OFF_NOTE.
 */
export async function askRules(deps: ChatDeps, ip: string, input: AskRulesInput): Promise<AsyncGenerator<string>> {
  // The per-IP limit fails open like every other endpoint's: in an outage the
  // daily check below refuses anyway, and while Redis is merely slow, failing
  // closed here too would only double the chance of a 503.
  const perIp = await rateLimitRefusal(deps.limiter, ip);
  if (perIp) throw refuse(perIp);

  const { slug, message } = input;
  if (!SLUG_RE.test(slug)) throw new ApiError(400, 'slug is required');

  // The rulebooks of games inside this one to read alongside it. Each picks
  // a file, so it gets the same shape check as slug; a repeat would only
  // resend the same rulebook to a paid model, so none are allowed.
  const sentParts = input.parts ?? undefined;
  if (sentParts !== undefined && !isRulebookList(sentParts)) {
    throw new ApiError(400, 'parts must be a list of rulebook names');
  }
  const parts = sentParts;

  if (!message.trim()) throw new ApiError(400, 'message is required');
  if (message.length > 500) throw new ApiError(400, 'message must be 500 characters or less');
  const history = checkHistory(input.history);

  let rulesText: string;
  try {
    rulesText = deps.assembleRulesText(slug, parts);
  } catch {
    throw new ApiError(404, 'Rules not found for this game');
  }

  // The daily budget is checked last, after the per-IP limit and every 400 or
  // 404, so it counts only questions that will reach Gemini: one abuser's
  // per-IP refusals, or malformed requests, can't burn everyone's budget.
  // If Redis can't answer, nothing would cap spend, so it fails closed.
  const daily = await rateLimitRefusal(deps.dailyLimiter, 'global', {
    refusal: DAILY_LIMIT_REFUSAL,
    failClosed: true,
  });
  if (daily) throw refuse(daily);

  Sentry.setTag('game_slug', slug);
  Sentry.setContext('chat', { slug, messageLength: message.length, historyLength: history?.length ?? 0 });

  const deadline = Date.now() + (deps.budgetMs ?? GEMINI_BUDGET_MS);
  let retried = false;
  for (;;) {
    try {
      const response = await deps.streamRulesAnswer({
        rulesText,
        message,
        history,
        apiKey: deps.apiKey,
        timeoutMs: Math.max(0, deadline - Date.now()),
      });
      const chunks = response[Symbol.asyncIterator]();
      // Nothing is on the wire until the first chunk: a failure before it
      // can still be retried, or answered with a status.
      for (;;) {
        const next = await chunks.next();
        if (next.done) return (async function* () {})();
        if (next.value.text) return answer(next.value.text, chunks);
      }
    } catch (err) {
      if (!retried && isOverloaded(err)) {
        retried = true;
        await new Promise((resolve) => setTimeout(resolve, deps.retryDelayMs ?? RETRY_DELAY_MS));
        continue;
      }
      await reportError('Gemini API error:', err);
      throw new ApiError(500, 'Failed to generate response');
    }
  }
}

/** The answer from its first chunk on; a failure partway ends it with the cut-off note. */
async function* answer(first: string, rest: AsyncIterator<AnswerChunk>): AsyncGenerator<string> {
  try {
    yield first;
    for (;;) {
      const next = await rest.next();
      if (next.done) return;
      if (next.value.text) yield next.value.text;
    }
  } catch (err) {
    await reportError('Gemini API error:', err);
    yield CUT_OFF_NOTE;
  } finally {
    // The reader went away (Yoga ends the stream early): stop Gemini too.
    await rest.return?.();
  }
}
