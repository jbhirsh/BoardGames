// The Sentry setup and error path every endpoint shares, so a change to
// either lands in all four at once instead of drifting one copy at a time.

import * as Sentry from '@sentry/node';

/**
 * Starts Sentry for this function. Each endpoint calls it from its module
 * body, after its imports, so it runs once per instance before any request
 * reaches the handler.
 */
export function initSentry(): void {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

/**
 * Reports an error and waits for it to be sent. The flush is awaited because
 * a serverless function may be frozen as soon as it answers, taking an
 * unsent event with it; this path is terminal and rare, so the wait is cheap.
 */
export async function reportError(label: string, err: unknown): Promise<void> {
  Sentry.captureException(err);
  await Sentry.flush(2000);
  console.error(label, err);
}

interface JsonResponse<R> {
  status(code: number): R;
  json(body: unknown): R;
}

/** Reports the error, then answers 500 with the generic body every endpoint uses. */
export async function failWith500<R extends JsonResponse<R>>(res: R, label: string, err: unknown): Promise<R> {
  await reportError(label, err);
  return res.status(500).json({ error: 'Server error' });
}
