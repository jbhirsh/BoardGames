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

/**
 * Rulebooks below this many bytes save themselves the first time they are
 * opened; larger ones wait for Save for offline. The service worker decides
 * (SAVE_ON_OPEN_BELOW in utils/offline.ts, written out here likewise); the
 * page needs it only to say so when one can't be had.
 */
export const SAVE_ON_OPEN_BELOW = 3_000_000;

/** Each rulebook's size in bytes, by its path, written in at build time (vite.config.ts). */
declare const __RULEBOOK_SIZES__: Readonly<Record<string, number>>;
const SIZES = __RULEBOOK_SIZES__;

/**
 * A rulebook's size in bytes, from the build, so the rules page shows it
 * from its first paint, online or not; null for a path the build has no
 * file at.
 */
export function rulebookBytes(src: string, sizes: Readonly<Record<string, number>> = SIZES): number | null {
  return Object.hasOwn(sizes, src) ? sizes[src] : null;
}

/**
 * Whether opening a rulebook leaves it unsaved until Save for offline is
 * tapped: it is too large to save itself on opening, or the browser is
 * asked to save data (savingData in utils/offline.ts), when none does.
 */
export function waitsForSave(
  src: string,
  sizes: Readonly<Record<string, number>> = SIZES,
  nav: object = navigator,
): boolean {
  return (
    (sizes[src] ?? 0) >= SAVE_ON_OPEN_BELOW ||
    (nav as { connection?: { saveData?: unknown } }).connection?.saveData === true
  );
}

// The message the service worker answers about a rulebook (SAVE_MESSAGE in
// src/sw/shell.ts), written out here likewise.
const SAVE_MESSAGE = 'gameroom-rulebook';

/**
 * Where a rulebook stands, as the service worker says (SaveState in
 * src/sw/shell.ts): 'saved' or 'unsaved', or 'saving' and then how the save
 * ended: 'saved', 'full' (no room left on the device) or 'failed'.
 */
export type SaveState = 'saved' | 'unsaved' | 'saving' | 'failed' | 'full';

/** The service worker in charge of the page, as far as telling it goes. */
export interface Controller {
  postMessage(message: unknown, transfer: Transferable[]): void;
}

/**
 * Asks the service worker in charge where a rulebook stands, and with
 * `save` to save it, the reader's files with it. `heard` hears each answer,
 * up to the last ('saving' is the only one that has another after it).
 * Returns a function that stops listening sooner (a save goes on).
 */
export function askWorker(
  worker: Controller,
  src: string,
  save: boolean,
  heard: (state: SaveState) => void,
): () => void {
  const { port1, port2 } = new MessageChannel();
  // Closed, a port may still hand over what was already on its way.
  let open = true;
  const stop = () => {
    open = false;
    port1.close();
  };
  port1.onmessage = (event: MessageEvent<{ path: string; state: SaveState }>) => {
    if (!open || event.data.path !== src) return;
    if (event.data.state !== 'saving') stop();
    heard(event.data.state);
  };
  worker.postMessage({ type: SAVE_MESSAGE, path: src, save }, [port2]);
  return stop;
}
