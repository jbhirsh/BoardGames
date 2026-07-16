import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as Sentry from '@sentry/node';
import { loadRulesText, streamRulesAnswer } from './_lib/rulesAssistant.js';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug, message, history } = req.body;

  // Validate slug
  if (!slug || typeof slug !== 'string') {
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
