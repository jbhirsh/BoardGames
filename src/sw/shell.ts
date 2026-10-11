// What the service worker (sw.ts) keeps in its caches, and when: the app
// saved at install, the rulebook reader's files, and what an update clears
// away. Written against CacheStorage alone (Cache.addAll does the fetching),
// so tests drive it with a fake (src/__tests__/swShell.test.ts).

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
}

/** Every build's shell cache is named this, then its version. */
export const SHELL_PREFIX = 'gameroom-shell-';
/** Files fetched along the way; outlives a build. */
export const ASSETS = 'gameroom-assets';
/** Rulebooks once opened; outlives a build. */
export const RULEBOOKS = 'gameroom-rulebooks';
/** A saved rulebook's contents hash, from the build that saved it. */
export const RULEBOOK_VERSION = 'X-Rulebook-Version';
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
  // Older builds' code (hashed names this build won't ask for), and pdf.js's
  // files fetched along the way, whose names don't change with its version.
  // Box art stays.
  const assets = await caches.open(ASSETS);
  for (const request of await assets.keys()) {
    if (/^\/(assets|pdfjs)\//.test(pathOf(request))) await assets.delete(request);
  }
}

/**
 * Completes the reader for the saved rulebooks, if an update left it
 * incomplete (a rulebook first saved while the old build ran filled the old
 * shell's); the older shells can go after (pruneShells). Rejects with no
 * network. Without saved rulebooks there is nothing to do.
 */
export async function healReader(build: Build, caches: CacheStorage): Promise<void> {
  if (!(await hasRulebooks(caches)) || (await readerSaved(build, caches))) return;
  await saveReader(build, caches);
}
