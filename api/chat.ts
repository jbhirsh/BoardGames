import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as Sentry from '@sentry/node';
import { loadRulesText, streamRulesAnswer, RULES_ASSISTANT_MAX_OUTPUT_TOKENS } from './_lib/rulesAssistant.js';
import { enforceRateLimit, getLimiter } from './_lib/rateLimit.js';
import { SLUG_RE } from './_lib/slug.js';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

// SLUG_RE constrains the slug before it reaches a filesystem path in
// loadRulesText, so it can't traverse out of rules-text/.

// Cap total history content, not just entry count, so a caller can't smuggle
// megabytes of prompt through it. Sized to fit a legitimate conversation:
// history is capped at 10 entries and each model reply is bounded by the output
// token cap (~4 chars/token), so a real multi-turn chat stays well under this
// while bulk-stuffing is still blocked. (A flat 4000 would reject the message
// right after one full-length answer got echoed back as history.)
const MAX_HISTORY_CONTENT = RULES_ASSISTANT_MAX_OUTPUT_TOKENS * 10 * 4;

// Expensive paid AI call, unauthenticated endpoint: bound requests per IP.
const chatLimiter = getLimiter('chat', 10, 60);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await enforceRateLimit(chatLimiter, req, res))) return;

  const { slug, message, history } = req.body;

  // Validate slug
  if (!slug || typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    return res.status(400).json({ error: 'slug is required' });
  }

  // Validate message
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (message.length > 500) {
    return res.status(400).json({ error: 'message must be 500 characters or less' });
  }

  // Validate history
  if (history && (!Array.isArray(history) || history.length > 10)) {
    return res.status(400).json({ error: 'history must be an array of 10 or fewer entries' });
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
    rulesText = loadRulesText(slug);
  } catch {
    return res.status(404).json({ error: 'Rules not found for this game' });
  }

  Sentry.setTag("game_slug", slug);
  Sentry.setContext("chat", { slug, messageLength: message.length, historyLength: history?.length ?? 0 });

  try {
    const response = await streamRulesAnswer({
      rulesText,
      message,
      history,
      apiKey: process.env.GEMINI_API_KEY!,
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    for await (const chunk of response) {
      const text = chunk.text;
      if (text) {
        res.write(text);
      }
    }

    res.end();
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error('Gemini API error:', err);
    return res.status(500).json({ error: 'Failed to generate response' });
  }
}
