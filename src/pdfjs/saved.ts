// Whether a rulebook is saved on this device, for the reader's warming
// (documents.ts) and for the rules page, which says so when one that isn't
// can't be had. Apart from documents.ts so the rules page can ask without
// loading pdf.js.

// The service worker's saved rulebooks (RULEBOOKS in src/sw/shell.ts),
// written out here since the service worker may share no code with the app
// (vite.config.ts).
const SAVED = 'gameroom-rulebooks';

/** How long a HEAD for a rulebook is given before the network counts as gone. */
export const PROBE_MS = 5000;

/** What a saved check reads of the browser: online, and the service worker. */
export interface Online {
  onLine: boolean;
  serviceWorker?: { controller: unknown };
}

/**
 * Whether the service worker has the rulebook saved, so reading it costs no
 * data and works offline. Without a service worker in charge of the page,
 * nothing would answer from the copy, so none counts. Matched as the
 * service worker matches (MATCH in src/sw/shell.ts).
 */
export async function savedCopy(
  src: string,
  nav: Online = navigator as Online,
  store: CacheStorage | undefined = globalThis.caches,
): Promise<boolean> {
  if (!store || !nav.serviceWorker?.controller) return false;
  try {
    return (await store.match(src, { cacheName: SAVED, ignoreVary: true })) !== undefined;
  } catch {
    return false;
  }
}

/**
 * The rulebook's HEAD, or null if the network gave no answer: it failed, or
 * didn't answer within `ms` (a dead Wi-Fi can leave a request hanging for
 * a minute), or `signal` called it off.
 */
export function head(
  src: string,
  signal?: AbortSignal,
  probe: typeof fetch = (...args) => fetch(...args),
  ms = PROBE_MS,
): Promise<Response | null> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const settle = (res: Response | null) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', giveUp);
      resolve(res);
    };
    // Settled at once, whether or not the request heeds the abort.
    const giveUp = () => {
      controller.abort();
      settle(null);
    };
    const timer = setTimeout(giveUp, ms);
    if (signal?.aborted) return giveUp();
    signal?.addEventListener('abort', giveUp);
    probe(src, { method: 'HEAD', signal: controller.signal }).then(settle, () => settle(null));
  });
}

/**
 * Whether a rulebook that wouldn't load is out of reach without a network:
 * not saved, and the browser offline or the network not answering (a
 * captive or dead Wi-Fi, where the browser still says it is online), which
 * `reached` asks: by default a HEAD of its own, though the rules page hands
 * over the one it made for the file's size. Asked once it has failed, so
 * its Download and Open links, which point at the same file, can go too.
 */
export async function outOfReach(
  src: string,
  reached: () => Promise<boolean> = async () => (await head(src)) !== null,
  nav: Online = navigator as Online,
  store: CacheStorage | undefined = globalThis.caches,
): Promise<boolean> {
  if (await savedCopy(src, nav, store)) return false;
  if (!nav.onLine) return true;
  return !(await reached());
}
