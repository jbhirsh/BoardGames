/// <reference lib="webworker" />
// The service worker: the site installed and usable offline, for game nights
// in basements and cabins. Built to /sw.js by the serviceWorker() plugin in
// vite.config.ts, which writes the five constants below. Routing and the
// byte ranges live in utils/offline.ts; what each cache keeps, and when, in
// ./shell.ts; which build files are saved when, in utils/precache.ts.
// main.tsx registers it in production builds only. It has its own
// tsconfig.sw.json (the WebWorker library, not the DOM), and
// public/manifest.webmanifest with its 192 and 512 icons makes the site
// installable.
//
// Pages come from the network (PAGE_TIMEOUT_MS at most), falling back to the
// app saved at install; /api/* and other sites are never touched, so a
// friend's suggestion's BoardGameGeek thumbnail is never saved. Sentry
// stamps sw.js on every build, so every deploy installs a new worker. Bulk
// saving of rulebooks and precaching the rules text are left out.
import { parseRange, rangeHeaders, routeFor, savesOnOpen, savingData } from '../utils/offline';
import { activate, ASSETS, healReader, install, isReaderMessage, MATCH, pruneShells, READER_MESSAGE, RULEBOOKS, saver, SHELL_PREFIX, stamped, type Build, type SaveReply } from './shell';

declare const self: ServiceWorkerGlobalScope;
/** Paths saved at install: the app's code (every page's), box art, the font, the word lists. */
declare const __PRECACHE__: string[];
/**
 * The rulebook reader's own files, pdf.js's worker and decoders: saved with
 * the first rulebook, and at install once one is saved, so every saved
 * rulebook reads offline, its pages not yet opened included.
 */
declare const __READER__: string[];
/** A hash of index.html and every file saved in the shell (the precache and the reader's), naming it. */
declare const __SW_VERSION__: string;
/** Each rulebook's path and a hash of its contents, to drop stale saved copies. */
declare const __RULEBOOKS__: Record<string, string>;
/** Each wishlist box art's path and a hash of its contents, likewise: saved as fetched, never at install. */
declare const __ART__: Record<string, string>;

const SHELL = `${SHELL_PREFIX}${__SW_VERSION__}`;
const BUILD: Build = { shell: SHELL, precache: __PRECACHE__, reader: __READER__, rulebooks: __RULEBOOKS__, art: __ART__ };
// The reader's files too: saved or not yet, they are this build's, kept in its shell.
const SHELL_PATHS = new Set([...__PRECACHE__, ...__READER__]);
// Rulebooks saved whole, once each however many range requests and pages
// ask for one; a newer build on its way in is told of each (tellNewer).
const saving = saver(BUILD, caches, (path) => fetch(path), () => tellNewer());
// Give a slow network this long before a page comes from the saved app.
const PAGE_TIMEOUT_MS = 4000;

// No skipWaiting: a new worker waits until no tab runs the old app, so a
// tab left open (an installed app on a phone, for days) keeps the code it
// loaded, offline too.
self.addEventListener('install', (event) => {
  event.waitUntil(install(BUILD, caches));
});

self.addEventListener('activate', (event) => {
  const activated = activate(BUILD, caches).then(() => self.clients.claim());
  event.waitUntil(activated);
  // After, not during: requests wait while a worker activates. If the
  // worker stops first, the next saved rulebook opened finishes it.
  void activated.then(() => heal());
});

// The rules page asking after the rulebook on screen, or to save it (its
// Save for offline button): answered on the port it sends, the worker kept
// alive until the save ends. Or an older build's worker, running the app
// while this one waits, saying it saved a rulebook: this build's reader is
// completed now, while there is a network (tellNewer).
self.addEventListener('message', (event) => {
  if (isReaderMessage(event.data)) return event.waitUntil(heal());
  const [port] = event.ports;
  if (port) event.waitUntil(saving.answer(event.data, (reply: SaveReply) => port.postMessage(reply)));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  switch (routeFor(request, self.location.origin, SHELL_PATHS)) {
    case 'page': return event.respondWith(page(request));
    case 'rulebook': return event.respondWith(rulebook(event));
    case 'shell': return event.respondWith(saved(event, SHELL));
    case 'asset': return event.respondWith(saved(event, ASSETS));
    case 'skip': return;
  }
});

/**
 * The network's page, or the app saved at install without one. The saved
 * app is never replaced from here: the page the network sends may be a newer
 * build's, whose code this worker hasn't saved, or not the app at all (box
 * art opened in its own tab).
 */
async function page(request: Request): Promise<Response> {
  try {
    return await Promise.race([
      fetch(request),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('slow')), PAGE_TIMEOUT_MS)),
    ]);
  } catch {
    return (await caches.match('/', { ...MATCH, cacheName: SHELL })) ?? Response.error();
  }
}

/**
 * The saved copy, or the network's, saved for next time in the background.
 * With no network, a copy in any cache: a newer build's code, in the shell
 * it saved while it waits (a page reloaded online after a deploy runs that
 * build's code under this worker), or the reader's files in an older shell
 * kept for them (shell.ts).
 */
async function saved(event: FetchEvent, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(event.request, MATCH);
  if (hit) return hit;
  let response: Response;
  try {
    response = await fetch(event.request);
  } catch (error) {
    const elsewhere = await caches.match(event.request, MATCH);
    if (elsewhere) return elsewhere;
    throw error;
  }
  const path = new URL(event.request.url).pathname;
  if (response.ok) event.waitUntil(cache.put(event.request, stamped(BUILD, path, response.clone())).catch(() => {}));
  return response;
}

/**
 * Tells a newer build, installed and waiting (or installing), that a
 * rulebook is saved. Installed with none saved, it has no reader in its
 * shell, and might take over offline before healReader could run: its app
 * asks for its own pdf.js worker (a new hashed name when pdf.js or the
 * reader's code changed), which no older shell holds, and a saved rulebook
 * couldn't draw. It completes its reader on hearing this (heal), still
 * waiting, so activating stays quick. A browser that can't message one
 * worker from another leaves it to healReader once active.
 */
function tellNewer() {
  for (const worker of [self.registration.installing, self.registration.waiting]) {
    try {
      worker?.postMessage({ type: READER_MESSAGE });
    } catch {
      // healReader completes it once active, online.
    }
  }
}

// The reader being completed (healReader), started once however often asked.
// The older shells go after, unless a newer build is on its way in: a
// shell that isn't this build's may be the newer one's.
let healing: Promise<void> | null = null;
function heal(): Promise<void> {
  const newest = () => !self.registration.installing && !self.registration.waiting;
  healing ??= healReader(BUILD, caches)
    .then(() => (newest() ? pruneShells(BUILD, caches) : undefined))
    .catch(() => {})
    .finally(() => { healing = null; });
  return healing;
}
// The rulebook being read, held so each of the reader's range requests is cut
// from memory rather than read whole from the cache again.
let open: { path: string; body: Blob; type: string } | null = null;

/**
 * A rulebook from its saved copy, or from the network. The rulebook reader
 * asks for byte ranges, which the Cache API can't store, so a rulebook is
 * kept whole and ranges cut from it. A small one is saved in the background
 * the first time it is opened (savesOnOpen), unless the browser is asked to
 * save data; a large one only when the rules page asks (its Save for
 * offline button), since saving it costs megabytes the reader's ranges
 * would never fetch. A warm request (the reader opening a rulebook ahead of
 * a tap) starts no save: its ranges come from the network alone.
 */
async function rulebook(event: FetchEvent): Promise<Response> {
  const { request } = event;
  const path = new URL(request.url).pathname;
  if (open?.path !== path) {
    const copy = await caches.match(path, { ...MATCH, cacheName: RULEBOOKS });
    open = copy ? { path, body: await copy.blob(), type: copy.headers.get('Content-Type') ?? 'application/pdf' } : null;
    // A saved rulebook opened: its reader, if an update left it incomplete.
    if (open) event.waitUntil(heal());
  }
  if (open) return fromCopy(request, open.body, open.type);
  const response = await fetch(request);
  // Decided before the page has the answer, so a page that asks after its
  // HEAD (useOfflineSave) hears of the save.
  if (savesOnOpen(request.headers, response, savingData(self.navigator))) event.waitUntil(saving.save(path));
  return response;
}

function fromCopy(request: Request, body: Blob, type: string): Response {
  const size = body.size;
  const range = parseRange(request.headers.get('Range'), size);
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  if (range) {
    const part = request.method === 'HEAD' ? null : body.slice(range.start, range.end + 1);
    return new Response(part, { status: 206, headers: rangeHeaders(range, size, type) });
  }
  // Content-Length is the file's, not the network's (which may have been
  // compressed in transit).
  const headers = { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' };
  return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
}
