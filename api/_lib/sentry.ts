// The API's Sentry setup and error path (api/graphql.ts, and every
// resolver through guarded() in api/_resolvers/errors.ts).

import * as Sentry from '@sentry/node';

/**
 * Starts Sentry for this function. api/graphql.ts calls it from its module
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
