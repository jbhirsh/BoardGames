// A page whose code won't load (lazyPages.ts). After a deploy, a tab's code
// names chunks the server no longer has (online, a 404) or that no cache
// holds (offline), and a reload fetches the app whose names match, or the
// saved one. One reload: a flag in sessionStorage stops a loop, and is
// cleared once a page's code loads.

/** The flag, in sessionStorage. */
export const RELOAD_KEY = 'gameroom:chunk-reload';

// Chrome's "Failed to fetch dynamically imported module", Firefox's "error
// loading dynamically imported module" and Safari's "Importing a module
// script failed".
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed/i;

/** Whether `error` is a page's code failing to load. */
export function isChunkLoadError(error: unknown): boolean {
  return error instanceof TypeError && CHUNK_ERROR.test(error.message);
}

/** Where the flag is kept; a getter, since reading sessionStorage can throw (storage blocked). */
export type Session = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Whether a reload hasn't been tried this session. Storage that can't be
 * read means no: without the flag a page that never loads would reload for
 * good.
 */
export function mayReload(session: Session): boolean {
  try {
    return session().getItem(RELOAD_KEY) === null;
  } catch {
    return false;
  }
}

/**
 * Calls `reload` unless a reload was already tried this session, and says
 * whether it did. Storage that can't be read or written means no reload:
 * without the flag a page that never loads would reload for good.
 */
export function reloadOnce(session: Session, reload: () => void): boolean {
  try {
    const storage = session();
    if (storage.getItem(RELOAD_KEY) !== null) return false;
    storage.setItem(RELOAD_KEY, '1');
  } catch {
    return false;
  }
  reload();
  return true;
}

/** Clears the flag: a page's code has loaded, so a later failure may reload again. */
export function chunkLoaded(session: Session): void {
  try {
    session().removeItem(RELOAD_KEY);
  } catch {
    // Nothing kept, nothing to clear.
  }
}
