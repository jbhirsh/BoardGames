import { parseWordList } from '../utils/wordList';

// public/words/: ENABLE (enable.txt, about 1.7 MB, about 450 KB compressed)
// and the hand-picked words it predates (additions.txt), fetched on the
// first check and kept for the session as one set.
const ENABLE_URL = '/words/enable.txt';
const ADDITIONS_URL = '/words/additions.txt';

// On a crawling connection, give up and let the dictionary answer instead.
const LOAD_TIMEOUT_MS = 10_000;

let loading: Promise<Set<string> | null> | null = null;

/**
 * The word-game word list, or null when ENABLE couldn't be fetched in time
 * (offline on a first visit, or too slow). A failed load is retried on the
 * next call. The additions are a bonus: without them (a service worker that
 * saved the site before they existed, offline) ENABLE still answers.
 */
export function loadWordList(): Promise<Set<string> | null> {
  if (!loading) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
    const text = (url: string) => fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))));
    loading = Promise.all([text(ENABLE_URL), text(ADDITIONS_URL).catch(() => '')])
      .then((texts) => parseWordList(texts.join('\n')))
      .catch(() => {
        loading = null;
        return null;
      })
      .finally(() => clearTimeout(timer));
  }
  return loading;
}
