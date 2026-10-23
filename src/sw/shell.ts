// What the service worker (sw.ts) keeps in its caches, and when: the app
// saved at install, the rulebook reader's files, the rulebooks saved one by
// one, and what an update clears away. Written against CacheStorage (whose
// Cache.addAll does the fetching) and a fetch passed in, so tests drive it
// with fakes (src/__tests__/swShell.test.ts).
import { WISHLIST_ART_DIR } from '../utils/precache';

/** One build's saved app, as vite.config.ts writes it into sw.js. */
export interface Build {
  /** The name of its shell cache. */
  shell: string;
  /** Saved at install. */
  precache: readonly string[];
  /** The rulebook reader's own files (utils/precache.ts): pdf.js's worker and decoders. */
  reader: readonly string[];
  /** Each rulebook's path and a hash of its contents. */
  rulebooks: Readonly<Record<string, string>>;
  /** Each wishlist box art's path (WISHLIST_ART_DIR) and a hash of its contents. */
  art: Readonly<Record<string, string>>;
}

/** Every build's shell cache is named this, then its version. */
export const SHELL_PREFIX = 'gameroom-shell-';
/** Files fetched along the way; outlives a build. */
export const ASSETS = 'gameroom-assets';
/** Rulebooks saved: small ones once opened, any when asked; outlives a build. */
export const RULEBOOKS = 'gameroom-rulebooks';
/** A saved rulebook's contents hash, from the build that saved it. */
export const RULEBOOK_VERSION = 'X-Rulebook-Version';
/** A saved wishlist box art's contents hash, from the build that saved it. */
export const ART_VERSION = 'X-Art-Version';
const ART = `/${WISHLIST_ART_DIR}/`;
// A module script asks with an Origin header and the server may answer
// Vary: Origin, which a copy saved without one would never match.
export const MATCH = { ignoreVary: true } as const;

const pathOf = (request: Request) => new URL(request.url).pathname;

async function hasRulebooks(caches: CacheStorage): Promise<boolean> {
  return (await (await caches.open(RULEBOOKS)).keys()).length > 0;
}

/**
 * Saves the build's app. A visitor with rulebooks saved gets this build's
 * reader for them too, while there is a network to fetch it.
 */
export async function install(build: Build, caches: CacheStorage): Promise<void> {
  const reader = (await hasRulebooks(caches)) ? build.reader : [];
  await (await caches.open(build.shell)).addAll(['/', ...build.precache, ...reader]);
}

/** Whether every one of the reader's files is in the build's shell. */
export async function readerSaved(build: Build, caches: CacheStorage): Promise<boolean> {
  const shell = await caches.open(build.shell);
  for (const path of build.reader) {
    if (!(await shell.match(path, MATCH))) return false;
  }
  return true;
}

/**
 * Saves the reader's files not in the build's shell yet. The worker fetches
 * a decoder only when a page needs it, so a rulebook read online in part
 * would otherwise reach a page offline whose images can't be decoded.
 */
export async function saveReader(build: Build, caches: CacheStorage): Promise<void> {
  const shell = await caches.open(build.shell);
  const missing: string[] = [];
  for (const path of build.reader) {
    if (!(await shell.match(path, MATCH))) missing.push(path);
  }
  await shell.addAll(missing);
}

/**
 * Deletes older builds' shells, unless a saved rulebook still needs the
 * reader one of them holds: this build's isn't complete (an update that
 * activated offline, after a rulebook was first saved under the old build).
 * The service worker finds a file in them when the network can't give it.
 * Only for the newest build: every other shell is taken for an older one's,
 * and a newer build's waiting to take over must stay.
 */
export async function pruneShells(build: Build, caches: CacheStorage): Promise<void> {
  if ((await hasRulebooks(caches)) && !(await readerSaved(build, caches))) return;
  for (const key of await caches.keys()) {
    if (key.startsWith(SHELL_PREFIX) && key !== build.shell) await caches.delete(key);
  }
}

/**
 * Makes the build's the saved app, clearing what older builds left. It
 * fetches nothing: requests wait while a worker activates. A reader left
 * incomplete is healReader's to finish.
 */
export async function activate(build: Build, caches: CacheStorage): Promise<void> {
  // Saved rulebooks whose file has changed or gone since they were saved.
  const rulebooks = await caches.open(RULEBOOKS);
  for (const request of await rulebooks.keys()) {
    const copy = await rulebooks.match(request);
    if (copy?.headers.get(RULEBOOK_VERSION) !== build.rulebooks[pathOf(request)]) await rulebooks.delete(request);
  }
  await pruneShells(build, caches);
  // Older builds' code (hashed names this build won't ask for), pdf.js's
  // files fetched along the way, whose names don't change with its version,
  // and wishlist box art whose file has changed or gone (or saved before
  // copies were marked). The rest of the art stays.
  const assets = await caches.open(ASSETS);
  for (const request of await assets.keys()) {
    const path = pathOf(request);
    if (
      /^\/(assets|pdfjs)\//.test(path) ||
      (path.startsWith(ART) && (await assets.match(request))?.headers.get(ART_VERSION) !== build.art[path])
    ) {
      await assets.delete(request);
    }
  }
}

/**
 * The copy of a file fetched along the way to keep: wishlist box art marked
 * with the build's hash of it, so the first build whose file differs drops
 * it on activating; anything else as it came. The network's file is taken
 * for this build's: a worker serving an older build marks the newer file
 * with its own hash, which a change drops once the newer build activates.
 */
export function stamped(build: Build, path: string, response: Response): Response {
  const hash = build.art[path];
  if (hash === undefined) return response;
  const headers = new Headers(response.headers);
  headers.set(ART_VERSION, hash);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Completes the reader for the saved rulebooks, if an update left it
 * incomplete (a rulebook first saved while the old build ran filled the old
 * shell's); the older shells can go after (pruneShells). Rejects with no
 * network. Without saved rulebooks there is nothing to do. Run by a build
 * waiting to take over too, told of the save (READER_MESSAGE): once active
 * it may be offline, and its app asks for its own pdf.js worker, under a
 * name no older shell has.
 */
export async function healReader(build: Build, caches: CacheStorage): Promise<void> {
  if (!(await hasRulebooks(caches)) || (await readerSaved(build, caches))) return;
  await saveReader(build, caches);
}

/**
 * Saves a rulebook whole (the Cache API keeps no byte ranges, so sw.ts cuts
 * them from the whole file), marked with this build's hash of it, then the
 * reader's files (`reader`, by default saveReader), so it reads offline from
 * any page. A rulebook already saved isn't fetched again, only the reader
 * completed. Rejects if either can't be had.
 */
export async function saveRulebook(
  path: string,
  build: Build,
  caches: CacheStorage,
  fetcher: (path: string) => Promise<Response>,
  reader: () => Promise<void> = () => saveReader(build, caches),
): Promise<void> {
  const rulebooks = await caches.open(RULEBOOKS);
  if (!(await rulebooks.match(path, MATCH))) {
    const response = await fetcher(path);
    if (response.status !== 200) throw new Error(`${path}: ${response.status}`);
    const headers = new Headers(response.headers);
    headers.set(RULEBOOK_VERSION, build.rulebooks[path] ?? '');
    await rulebooks.put(path, new Response(await response.arrayBuffer(), { status: 200, headers }));
  }
  await reader();
}

/**
 * What the rules page sends the service worker about a rulebook on screen
 * (src/pdfjs/saved.ts, which writes the type out again since the two share
 * no code): where it stands on this device, and with `save`, to save it
 * (its Save for offline button). Answered on the MessagePort sent with it.
 */
export const SAVE_MESSAGE = 'gameroom-rulebook';
interface SaveRequest {
  type: typeof SAVE_MESSAGE;
  path: string;
  save: boolean;
}

/**
 * What the worker running the app sends a newer build's, installed and
 * waiting to take over (or still installing), once it has saved a rulebook:
 * a build installed with no rulebook saved has no reader in its shell, and
 * completes it on hearing this (healReader), while there is a network.
 */
export const READER_MESSAGE = 'gameroom-reader';
export function isReaderMessage(message: unknown): boolean {
  return (message as { type?: unknown } | null)?.type === READER_MESSAGE;
}

/**
 * Each answer on the port: 'saved', or 'unsaved' when not asked to save it;
 * else 'saving', then how the save ended (one the service worker began on
 * its own, on a small rulebook's first open, too): 'saved', 'full' when the
 * browser has no room left for the site, or 'failed'.
 */
type SaveState = 'saved' | 'unsaved' | 'saving' | SaveOutcome;
/** How a save ends. */
type SaveOutcome = 'saved' | 'failed' | 'full';
export interface SaveReply {
  path: string;
  state: SaveState;
}

/** The service worker's saving of rulebooks: on first open, or asked by the rules page. */
export interface Saver {
  /** Saves a rulebook, or joins the save under way, resolving to how it ended. */
  save(path: string): Promise<SaveOutcome>;
  /** Answers a page's message (SaveRequest) through `reply`; anything else, or a path that names no rulebook of the build, gets no answer. */
  answer(message: unknown, reply: (answer: SaveReply) => void): Promise<void>;
}

/** Whether a save failed for want of room: the Cache API's quota error. */
const isFull = (error: unknown) => (error as { name?: unknown } | null)?.name === 'QuotaExceededError';

/** `saved` is told of each save that ends saved, once however many asked for it. */
export function saver(
  build: Build,
  caches: CacheStorage,
  fetcher: (path: string) => Promise<Response>,
  saved: (path: string) => void = () => {},
): Saver {
  // One save per rulebook, however many requests and pages ask for it.
  const saving = new Map<string, Promise<SaveOutcome>>();
  // And one saving of the reader's files, however many rulebooks are saved
  // at once: each would otherwise fetch the files none has saved yet.
  let readerSaving: Promise<void> | null = null;
  const reader = () => {
    readerSaving ??= saveReader(build, caches).finally(() => {
      readerSaving = null;
    });
    return readerSaving;
  };
  const save = (path: string) => {
    let done = saving.get(path);
    if (!done) {
      done = saveRulebook(path, build, caches, fetcher, reader)
        .then(
          (): SaveOutcome => {
            saved(path);
            return 'saved';
          },
          (error: unknown): SaveOutcome => (isFull(error) ? 'full' : 'failed'),
        )
        .finally(() => saving.delete(path));
      saving.set(path, done);
    }
    return done;
  };
  const isRequest = (message: unknown): message is SaveRequest => {
    const m = message as Partial<SaveRequest> | null;
    return (
      typeof m === 'object' &&
      m !== null &&
      m.type === SAVE_MESSAGE &&
      typeof m.save === 'boolean' &&
      typeof m.path === 'string' &&
      Object.hasOwn(build.rulebooks, m.path)
    );
  };
  return {
    save,
    async answer(message, reply) {
      if (!isRequest(message)) return;
      const { path } = message;
      if (!saving.has(path) && (await (await caches.open(RULEBOOKS)).match(path, MATCH)))
        return reply({ path, state: 'saved' });
      // Asked again after the wait: a save may have begun meanwhile.
      const done = saving.get(path) ?? (message.save ? save(path) : null);
      if (!done) return reply({ path, state: 'unsaved' });
      reply({ path, state: 'saving' });
      reply({ path, state: await done });
    },
  };
}
