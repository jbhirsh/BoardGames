// How the API says no. A resolver throws an ApiError with the HTTP status
// the old REST endpoints answered (400, 403, 404, 409, 429, 503); GraphQL
// Yoga answers with that status and the error's message, and the client
// reads `extensions.code`. Anything else a resolver throws is a fault of
// ours: guarded() reports it to Sentry under the operation's label and
// answers a plain "Server error", as every endpoint did.

import { GraphQLError } from 'graphql';
import { reportError } from '../_lib/sentry.js';

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_SERVER_ERROR',
  503: 'UNAVAILABLE',
  504: 'TIMEOUT',
};

/** A refusal the caller can read: its message, `extensions.code` and the HTTP status Yoga answers with. */
export class ApiError extends GraphQLError {
  readonly status: number;
  constructor(status: number, message: string, extensions: Record<string, unknown> = {}) {
    super(message, { extensions: { code: CODES[status] ?? CODES[500], ...extensions, http: { status } } });
    this.status = status;
  }
}

/**
 * Runs one operation within its time limit. An ApiError passes through; any
 * other failure is reported under `label` and becomes a 500. Past `limitMs`
 * it answers 504, as the platform used to when each endpoint had its own
 * function and maxDuration (votes 10 s, the rest 15 s; the chat has its own
 * budget). The work itself isn't cancelled, any more than a platform
 * timeout cancelled it.
 */
export async function guarded<T>(label: string, limitMs: number, run: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError(504, 'That took too long. Please try again.')), limitMs);
  });
  try {
    return await Promise.race([run(), late]);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 504) await reportError(`${label} timed out`, err);
      throw err;
    }
    await reportError(label, err);
    // Nothing about the cause leaks.
    throw new ApiError(500, 'Server error');
  } finally {
    clearTimeout(timer);
  }
}
