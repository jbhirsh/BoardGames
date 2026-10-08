/// <reference lib="webworker" />
// The service worker: the site installed and usable offline, for game nights
// in basements and cabins. Built to /sw.js by the serviceWorker() plugin in
// vite.config.ts, which writes the three constants below. Routing and the
// byte ranges live in utils/offline.ts.
import { parseRange, rangeHeaders, routeFor } from '../utils/offline';

declare const self: ServiceWorkerGlobalScope;
/** Paths saved at install: the app's code, box art, pdf.js's files, the word list. */
declare const __PRECACHE__: string[];
/** A hash of index.html and every precached file, naming the saved shell. */
declare const __SW_VERSION__: string;
/** Each rulebook's path and a hash of its contents, to drop stale saved copies. */
declare const __RULEBOOKS__: Record<string, string>;

const SHELL = `gameroom-shell-${__SW_VERSION__}`;
// Files fetched along the way (box art not precached, code split off later),
// and rulebooks once opened. Neither is named for a build: they outlive one.
const ASSETS = 'gameroom-assets';
const RULEBOOKS = 'gameroom-rulebooks';
// A saved rulebook's contents hash, from __RULEBOOKS__ when it was saved.
const RULEBOOK_VERSION = 'X-Rulebook-Version';
const PRECACHED = new Set(__PRECACHE__);
// Give a slow network this long before a page comes from the saved app.
const PAGE_TIMEOUT_MS = 4000;
// A module script asks with an Origin header and the server may answer
// Vary: Origin, which a copy saved without one would never match.
const MATCH = { ignoreVary: true } as const;

// No skipWaiting: a new worker waits until no tab runs the old app, so a
// tab left open (an installed app on a phone, for days) keeps the code it
// loaded, offline too.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(['/', ...__PRECACHE__])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('gameroom-shell-') && key !== SHELL) await caches.delete(key);
    }
    // Older builds' code (hashed names this build won't ask for); box art stays.
    const assets = await caches.open(ASSETS);
    for (const request of await assets.keys()) {
      if (new URL(request.url).pathname.startsWith('/assets/')) await assets.delete(request);
    }
    // Saved rulebooks whose file has changed or gone since they were saved.
    const rulebooks = await caches.open(RULEBOOKS);
    for (const request of await rulebooks.keys()) {
      const copy = await rulebooks.match(request);
      const path = new URL(request.url).pathname;
      if (copy?.headers.get(RULEBOOK_VERSION) !== __RULEBOOKS__[path]) await rulebooks.delete(request);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  switch (routeFor(request, self.location.origin, PRECACHED)) {
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

/** The saved copy, or the network's, saved for next time in the background. */
async function saved(event: FetchEvent, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(event.request, MATCH);
  if (hit) return hit;
  const response = await fetch(event.request);
  if (response.ok) event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
  return response;
}

// Rulebooks being saved, so a reader's many range requests fetch the file once.
const saving = new Set<string>();
// The rulebook being read, held so each of the reader's range requests is cut
// from memory rather than read whole from the cache again.
let open: { path: string; body: Blob; type: string } | null = null;

/**
 * A rulebook from its saved copy, or from the network while the whole file is
 * saved in the background. The phone reader asks for byte ranges, which the
 * Cache API can't store, so the whole file is kept and ranges cut from it.
 */
async function rulebook(event: FetchEvent): Promise<Response> {
  const { request } = event;
  const path = new URL(request.url).pathname;
  if (open?.path !== path) {
    const copy = await caches.match(path, { ...MATCH, cacheName: RULEBOOKS });
    open = copy ? { path, body: await copy.blob(), type: copy.headers.get('Content-Type') ?? 'application/pdf' } : null;
  }
  if (open) return fromCopy(request, open.body, open.type);
  if (!saving.has(path)) {
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
