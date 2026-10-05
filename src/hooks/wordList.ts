import { parseWordList } from '../utils/wordList';

// public/words/enable.txt: about 1.7 MB, about 450 KB compressed, fetched
// on the first check and kept for the session.
const WORD_LIST_URL = '/words/enable.txt';

// On a crawling connection, give up and let the dictionary answer instead.
const LOAD_TIMEOUT_MS = 10_000;

let loading: Promise<Set<string> | null> | null = null;

/**
 * The word-game word list, or null when it couldn't be fetched in time
 * (offline on a first visit, or too slow). A failed load is retried on the
 * next call.
 */
export function loadWordList(): Promise<Set<string> | null> {
  if (!loading) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
    loading = fetch(WORD_LIST_URL, { signal: controller.signal })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(parseWordList)
      .catch(() => {
        loading = null;
        return null;
      })
      .finally(() => clearTimeout(timer));
  }
  return loading;
}
