import * as Sentry from '@sentry/react';
import { isMissingPage, readDefinitions } from '../utils/wiktionary';
import type { Meaning } from '../utils/wiktionary';

// Wiktionary's REST definition API: Wikimedia-hosted, keyless, and open to
// any origin. It answers in well under a second; past this the checker stops
// waiting, since the dictionary only adds meanings or a second opinion.
const DICTIONARY_URL = 'https://en.wiktionary.org/api/rest_v1/page/definition/';
const DICTIONARY_TIMEOUT_MS = 5000;

/**
 * Playable with the meanings to show, not playable (the API's 404 for a
 * missing page, or no sense that counts: see utils/wiktionary.ts), or null
 * when the dictionary couldn't answer: offline, timed out, any other HTTP
 * error, or a body that isn't usable.
 */
export type Lookup = { found: true; meanings: Meaning[] } | { found: false } | null;

let reportedUnreachable = false;
let reportedUnexpected = false;

/**
 * Tells Sentry, once per page load, that the dictionary couldn't be reached
 * (a timeout, a network error, or any status but ok, a missing page's 404
 * and 429), so an outage like dictionaryapi.dev's (#186) shows up instead of
 * only reading as amber notices. A 429 is Wikimedia limiting this one
 * visitor, and an offline device says nothing about the service; neither is
 * reported.
 */
function reportUnreachable(status: number | 'timeout' | 'network error') {
  if (reportedUnreachable || status === 429 || navigator.onLine === false) return;
  reportedUnreachable = true;
  Sentry.captureMessage('word checker: dictionary unreachable', { level: 'warning', extra: { status } });
}

/** Tells Sentry, once per page load, of a body the checker can't read. */
function reportUnexpected() {
  if (reportedUnexpected) return;
  reportedUnexpected = true;
  Sentry.captureMessage('word checker: unexpected dictionary response', { level: 'warning' });
}

/** Asks Wiktionary whether `word` (lowercase letters) is a playable word. */
export async function lookUp(word: string): Promise<Lookup> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DICTIONARY_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${DICTIONARY_URL}${encodeURIComponent(word)}`, { signal: controller.signal });
    } catch {
      reportUnreachable(controller.signal.aborted ? 'timeout' : 'network error');
      return null;
    }
    const missing = res.status === 404;
    if (!res.ok && !missing) {
      reportUnreachable(res.status);
      return null;
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      // A body that isn't JSON, or one cut off by the timeout.
      if (controller.signal.aborted) reportUnreachable('timeout');
      else if (missing) reportUnreachable(404);
      else reportUnexpected();
      return null;
    }
    if (missing) {
      // Only the API's own "no such page" says the word isn't there.
      if (isMissingPage(data)) return { found: false };
      reportUnreachable(404);
      return null;
    }
    const reading = readDefinitions(data, word);
    if (!reading) {
      reportUnexpected();
      return null;
    }
    return reading.playable ? { found: true, meanings: reading.meanings } : { found: false };
  } finally {
    clearTimeout(timer);
  }
}
