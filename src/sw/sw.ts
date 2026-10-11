/// <reference lib="webworker" />
// The service worker: the site installed and usable offline, for game nights
// in basements and cabins. Built to /sw.js by the serviceWorker() plugin in
// vite.config.ts, which writes the four constants below. Routing and the
// byte ranges live in utils/offline.ts; what each cache keeps, and when, in
// ./shell.ts.
import { parseRange, rangeHeaders, routeFor, savesRulebook } from '../utils/offline';
import { activate, ASSETS, healReader, install, MATCH, pruneShells, RULEBOOK_VERSION, RULEBOOKS, saveReader, SHELL_PREFIX, type Build } from './shell';

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

const SHELL = `${SHELL_PREFIX}${__SW_VERSION__}`;
const BUILD: Build = { shell: SHELL, precache: __PRECACHE__, reader: __READER__, rulebooks: __RULEBOOKS__ };
// The reader's files too: saved or not yet, they are this build's, kept in its shell.
const SHELL_PATHS = new Set([...__PRECACHE__, ...__READER__]);
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
  if (response.ok) event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
  return response;
}

// Rulebooks being saved, so a reader's many range requests fetch the file once.
const saving = new Set<string>();
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
 * A rulebook from its saved copy, or from the network while the whole file is
 * saved in the background. The rulebook reader asks for byte ranges, which the
 * Cache API can't store, so the whole file is kept and ranges cut from it. A
 * warm request (the reader opening a rulebook ahead of a tap) starts no save:
 * its ranges come from the network alone.
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
  if (savesRulebook(request.headers) && !saving.has(path)) {
    saving.add(path);
    event.waitUntil(save(path).catch(() => {}).finally(() => saving.delete(path)));
  }
  return fetch(request);
}

async function save(path: string): Promise<void> {
  const response = await fetch(path);
  if (response.status !== 200) return;
  const headers = new Headers(response.headers);
  headers.set(RULEBOOK_VERSION, __RULEBOOKS__[path] ?? '');
  const copy = new Response(await response.blob(), { status: 200, headers });
  await (await caches.open(RULEBOOKS)).put(path, copy);
  await saveReader(BUILD, caches);
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
