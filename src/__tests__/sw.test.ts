// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ART_VERSION,
  ASSETS,
  READER_MESSAGE,
  RULEBOOK_VERSION,
  RULEBOOKS,
  SAVE_MESSAGE,
  SHELL_PREFIX,
} from '../sw/shell';

// sw.ts as the browser runs it: loaded into a worker's global scope, with the
// five constants vite.config.ts writes, its handlers driven by the events the
// browser sends. swShell.test.ts covers what each cache keeps, and when; here
// is how the events reach it, and how each request is answered. Its scope,
// caches and network are fakes over Maps, as there. In Node, not jsdom: a
// worker has no DOM, and jsdom's Blob isn't the one Node 24's Response takes,
// so a range cut from a saved rulebook would read as "[object Blob]".

// sw.ts has the WebWorker library (tsconfig.sw.json), which can't share a
// program with the DOM's, so it is loaded by a path TypeScript doesn't follow.
const SW = '../sw/sw';

const ORIGIN = 'https://game-room.example';
const VERSION = 'b';
const SHELL = `${SHELL_PREFIX}${VERSION}`;
const OLD_SHELL = `${SHELL_PREFIX}a`;
const PRECACHE = ['/assets/index-b.js', '/words/enable.txt'];
const READER = ['/assets/worker-b.js', '/pdfjs/wasm/openjpeg.wasm'];
const RULEBOOK_HASHES = { '/rules/azul.pdf': 'azul1', '/rules/catan.pdf': 'catan1' };
const ART = { '/images/wishlist/cascadia.jpg': 'cascadia1' };

const pathOf = (request: RequestInfo | URL) =>
  new URL(typeof request === 'object' && 'url' in request ? request.url : String(request), ORIGIN).pathname;

/** What the fake network answers, by path; a path it lacks fails, as offline. */
type Network = Map<string, () => Response>;

/** A Cache over a Map, fetching as Cache.addAll does: every file or none. */
class FakeCache {
  entries = new Map<string, Response>();
  async match(request: RequestInfo | URL) {
    return this.entries.get(pathOf(request))?.clone();
  }
  async put(request: RequestInfo | URL, response: Response) {
    this.entries.set(pathOf(request), response);
  }
  async delete(request: RequestInfo | URL) {
    return this.entries.delete(pathOf(request));
  }
  async keys() {
    return [...this.entries.keys()].map((path) => new Request(ORIGIN + path));
  }
  async addAll(paths: string[]) {
    const responses = await Promise.all(paths.map((path) => fetch(path)));
    paths.forEach((path, i) => this.entries.set(path, responses[i]!));
  }
}

class FakeCaches {
  caches = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name)!;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
  async match(request: RequestInfo | URL, options?: { cacheName?: string }) {
    for (const [name, cache] of this.caches) {
      if (options?.cacheName !== undefined && name !== options.cacheName) continue;
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
  /** The paths in cache `name`, sorted, or null if there is none. */
  paths(name: string) {
    const cache = this.caches.get(name);
    return cache ? [...cache.entries.keys()].sort() : null;
  }
}

/** The parts of an ExtendableEvent sw.ts uses, keeping what it waits on. */
class FakeEvent {
  waits: Array<Promise<unknown>> = [];
  waitUntil(promise: Promise<unknown>) {
    this.waits.push(promise);
  }
  /** Everything it was kept alive for, settled. */
  async done() {
    for (let seen = 0; seen < this.waits.length; seen = this.waits.length) await Promise.allSettled(this.waits);
  }
}

class FakeFetchEvent extends FakeEvent {
  request: Request;
  answer: Promise<Response> | null = null;
  constructor(request: Request) {
    super();
    this.request = request;
  }
  respondWith(answer: Promise<Response>) {
    this.answer = answer;
  }
}

class FakeMessageEvent extends FakeEvent {
  data: unknown;
  ports: Array<{ postMessage: (reply: unknown) => void }>;
  constructor(data: unknown, ports: FakeMessageEvent['ports'] = []) {
    super();
    this.data = data;
    this.ports = ports;
  }
}

/** A newer build's worker, installing or waiting. */
interface Worker {
  postMessage: (message: unknown) => void;
}

/** A worker's global scope, as much of it as sw.ts reaches. */
interface Scope {
  listeners: Map<string, (event: FakeEvent) => void>;
  addEventListener: (type: string, listener: (event: FakeEvent) => void) => void;
  location: { origin: string };
  registration: { installing: Worker | null; waiting: Worker | null };
  clients: { claim: () => Promise<void> };
  navigator: { connection?: { saveData: boolean } };
}

let network: Network;
let caches: FakeCaches;
let scope: Scope;
let fetched: string[];

/** Serves `paths` (each answering its own path) beside what the network has. */
function serve(...paths: string[]) {
  for (const path of paths) network.set(path, () => new Response(path));
}

/** Loads sw.ts afresh into a new scope, so each test starts with its module's state empty. */
async function load() {
  vi.resetModules();
  await import(/* @vite-ignore */ SW);
}

beforeEach(() => {
  network = new Map();
  caches = new FakeCaches();
  fetched = [];
  const listeners: Scope['listeners'] = new Map();
  scope = {
    listeners,
    addEventListener: (type, listener) => listeners.set(type, listener),
    location: { origin: ORIGIN },
    registration: { installing: null, waiting: null },
    clients: { claim: vi.fn(async () => {}) },
    navigator: {},
  };
  vi.stubGlobal('self', scope);
  vi.stubGlobal('caches', caches);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: RequestInfo | URL) => {
      const path = pathOf(request);
      fetched.push(path);
      const answer = network.get(path);
      if (!answer) throw new TypeError('Failed to fetch');
      return answer();
    }),
  );
  vi.stubGlobal('__PRECACHE__', PRECACHE);
  vi.stubGlobal('__READER__', READER);
  vi.stubGlobal('__SW_VERSION__', VERSION);
  vi.stubGlobal('__RULEBOOKS__', RULEBOOK_HASHES);
  vi.stubGlobal('__ART__', ART);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Sends `event` to sw.ts's listener for `type`. */
function dispatch<E extends FakeEvent>(type: string, event: E): E {
  scope.listeners.get(type)!(event);
  return event;
}

/** A request the page makes; `navigate` for a page's. */
function request(path: string, init: RequestInit & { navigate?: boolean } = {}): Request {
  const req = new Request(ORIGIN + path, init);
  // The Fetch API won't make a navigation; the browser does.
  return init.navigate ? Object.defineProperty(req, 'mode', { value: 'navigate' }) : req;
}

/** Fetches `path` through sw.ts: its answer, or null when it leaves the request to the browser. */
async function get(path: string, init?: RequestInit & { navigate?: boolean }) {
  const event = dispatch('fetch', new FakeFetchEvent(request(path, init)));
  return { event, response: event.answer && (await event.answer) };
}

/** A rulebook saved as sw.ts saves one: whole, marked with the build's hash of it. */
async function saveRulebook(path: keyof typeof RULEBOOK_HASHES, body = '%PDF-0123456789') {
  await (
    await caches.open(RULEBOOKS)
  ).put(
    path,
    new Response(body, { headers: { 'Content-Type': 'application/pdf', [RULEBOOK_VERSION]: RULEBOOK_HASHES[path] } }),
  );
}

describe('install', () => {
  it("saves the build's app under its version", async () => {
    await load();
    serve('/', ...PRECACHE);
    await dispatch('install', new FakeEvent()).done();
    expect(caches.paths(SHELL)).toEqual(['/', ...PRECACHE].sort());
  });

  it('fails, saving nothing, without a network', async () => {
    await load();
    const event = dispatch('install', new FakeEvent());
    await expect(event.waits[0]).rejects.toThrow('Failed to fetch');
    expect(caches.paths(SHELL)).toEqual([]);
  });
});

describe('activate', () => {
  it('drops older shells, then takes over the open tabs', async () => {
    await load();
    await caches.open(OLD_SHELL);
    await caches.open(SHELL);
    await dispatch('activate', new FakeEvent()).done();
    expect(await caches.keys()).not.toContain(OLD_SHELL);
    expect(scope.clients.claim).toHaveBeenCalledOnce();
  });

  it('completes the reader for a saved rulebook after taking over, then drops the shell kept for it', async () => {
    await load();
    await caches.open(SHELL);
    await (await caches.open(OLD_SHELL)).put('/assets/worker-a.js', new Response('a'));
    await saveRulebook('/rules/azul.pdf');
    serve(...READER);
    await dispatch('activate', new FakeEvent()).done();
    await vi.waitFor(async () => expect(await caches.keys()).not.toContain(OLD_SHELL));
    expect(caches.paths(SHELL)).toEqual([...READER].sort());
  });

  it('keeps the older shells when the reader is still incomplete, offline', async () => {
    await load();
    await caches.open(SHELL);
    await caches.open(OLD_SHELL);
    await saveRulebook('/rules/azul.pdf');
    await dispatch('activate', new FakeEvent()).done();
    await vi.waitFor(() => expect(fetched).toEqual(READER));
    expect(await caches.keys()).toContain(OLD_SHELL);
  });
});

describe('fetch', () => {
  it.each([
    ['/api/graphql', {}],
    ['/assets/index-b.js', { method: 'POST', body: 'x' }],
    ['/favicon.ico', {}],
  ])('leaves %s to the browser', async (path, init) => {
    await load();
    expect((await get(path, init)).response).toBeNull();
  });

  it('leaves other sites to the browser', async () => {
    await load();
    const event = dispatch('fetch', new FakeFetchEvent(new Request('https://cf.geekdo-images.com/pic.jpg')));
    expect(event.answer).toBeNull();
  });

  describe('a page', () => {
    beforeEach(async () => {
      await load();
      await (await caches.open(SHELL)).put('/', new Response('saved app'));
      await (await caches.open(OLD_SHELL)).put('/', new Response('old app'));
    });

    it("is the network's, and the saved app is left as it was", async () => {
      network.set('/rules/catan', () => new Response('new app'));
      expect(await (await get('/rules/catan', { navigate: true })).response!.text()).toBe('new app');
      expect(await (await caches.match('/', { cacheName: SHELL }))!.text()).toBe('saved app');
    });

    it("is this build's saved app offline", async () => {
      expect(await (await get('/rules/catan', { navigate: true })).response!.text()).toBe('saved app');
    });

    it('is the saved app when the network is slow', async () => {
      vi.useFakeTimers();
      network.set('/', () => new Response('late'));
      vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(() => {}));
      const event = dispatch('fetch', new FakeFetchEvent(request('/', { navigate: true })));
      await vi.advanceTimersByTimeAsync(3999);
      let answered = false;
      void event.answer!.then(() => (answered = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(answered).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await (await event.answer!).text()).toBe('saved app');
    });

    it('is a network error offline before the app is saved', async () => {
      await caches.delete(SHELL);
      expect((await get('/', { navigate: true })).response!.type).toBe('error');
    });
  });

  describe("a file of the build's app", () => {
    it('comes from its shell, not the network', async () => {
      await load();
      await (await caches.open(SHELL)).put('/assets/index-b.js', new Response('saved code'));
      serve('/assets/index-b.js');
      expect(await (await get('/assets/index-b.js')).response!.text()).toBe('saved code');
      expect(fetched).toEqual([]);
    });

    it("is the network's when its shell lacks it, and saved there", async () => {
      await load();
      serve('/assets/worker-b.js');
      const { event, response } = await get('/assets/worker-b.js');
      expect(await response!.text()).toBe('/assets/worker-b.js');
      await event.done();
      expect(caches.paths(SHELL)).toEqual(['/assets/worker-b.js']);
    });

    it("offline, is any cache's copy: a newer build's or an older shell's", async () => {
      await load();
      await (await caches.open(OLD_SHELL)).put('/assets/worker-b.js', new Response('kept'));
      expect(await (await get('/assets/worker-b.js')).response!.text()).toBe('kept');
    });

    it('offline with no copy anywhere, fails as the network did', async () => {
      await load();
      await expect(get('/assets/worker-b.js')).rejects.toThrow('Failed to fetch');
    });
  });

  describe('another file of the app', () => {
    it('is saved as fetched, and answered from the copy after', async () => {
      await load();
      serve('/assets/RulesPage-b.js');
      const first = await get('/assets/RulesPage-b.js');
      await first.event.done();
      network.clear();
      expect(await (await get('/assets/RulesPage-b.js')).response!.text()).toBe('/assets/RulesPage-b.js');
      expect(caches.paths(ASSETS)).toEqual(['/assets/RulesPage-b.js']);
    });

    it("is wishlist art marked with the build's hash of it", async () => {
      await load();
      serve('/images/wishlist/cascadia.jpg');
      const { event } = await get('/images/wishlist/cascadia.jpg');
      await event.done();
      const copy = await caches.match('/images/wishlist/cascadia.jpg', { cacheName: ASSETS });
      expect(copy!.headers.get(ART_VERSION)).toBe('cascadia1');
    });

    it("isn't saved when the network's answer is an error", async () => {
      await load();
      network.set('/images/missing.webp', () => new Response('gone', { status: 404 }));
      const { event, response } = await get('/images/missing.webp');
      expect(response!.status).toBe(404);
      await event.done();
      expect(caches.paths(ASSETS)).toEqual([]);
    });

    it("is answered all the same when it can't be saved", async () => {
      await load();
      serve('/images/catan.webp');
      vi.spyOn(await caches.open(ASSETS), 'put').mockRejectedValue(
        new DOMException('The quota has been exceeded.', 'QuotaExceededError'),
      );
      const { event, response } = await get('/images/catan.webp');
      expect(response!.ok).toBe(true);
      await event.done();
      await Promise.all(event.waits.map((wait) => expect(wait).resolves.toBeUndefined()));
    });
  });
});

describe('a rulebook', () => {
  const PDF = '%PDF-0123456789';

  describe('saved', () => {
    beforeEach(async () => {
      await load();
      await saveRulebook('/rules/azul.pdf', PDF);
      // With its reader, which an opened rulebook completes otherwise (below).
      const shell = await caches.open(SHELL);
      for (const path of READER) await shell.put(path, new Response(path));
    });

    it('is answered whole from the copy, with its own length', async () => {
      const { response } = await get('/rules/azul.pdf');
      expect(response!.status).toBe(200);
      expect(Object.fromEntries(response!.headers)).toEqual({
        'accept-ranges': 'bytes',
        'content-length': String(PDF.length),
        'content-type': 'application/pdf',
      });
      expect(await response!.text()).toBe(PDF);
      expect(fetched).toEqual([]);
    });

    it('is cut into the byte range the reader asks for', async () => {
      const { response } = await get('/rules/azul.pdf', { headers: { Range: 'bytes=5-9' } });
      expect(response!.status).toBe(206);
      expect(response!.headers.get('Content-Range')).toBe(`bytes 5-9/${PDF.length}`);
      expect(await response!.text()).toBe('01234');
    });

    it('answers a HEAD with the headers alone', async () => {
      const whole = (await get('/rules/azul.pdf', { method: 'HEAD' })).response!;
      expect([whole.status, whole.headers.get('Content-Length'), await whole.text()]).toEqual([
        200,
        String(PDF.length),
        '',
      ]);
      const part = (await get('/rules/azul.pdf', { method: 'HEAD', headers: { Range: 'bytes=0-4' } })).response!;
      expect([part.status, part.headers.get('Content-Length'), await part.text()]).toEqual([206, '5', '']);
    });

    it('refuses a range past its end', async () => {
      const { response } = await get('/rules/azul.pdf', { headers: { Range: 'bytes=99-' } });
      expect(response!.status).toBe(416);
      expect(response!.headers.get('Content-Range')).toBe(`bytes */${PDF.length}`);
    });

    it('is read from the cache once for all the range requests of it, and again for another rulebook', async () => {
      const match = vi.spyOn(caches, 'match');
      await get('/rules/azul.pdf', { headers: { Range: 'bytes=0-4' } });
      await get('/rules/azul.pdf', { headers: { Range: 'bytes=5-9' } });
      expect(match).toHaveBeenCalledOnce();
      await saveRulebook('/rules/catan.pdf', '%PDF-catan');
      expect(await (await get('/rules/catan.pdf')).response!.text()).toBe('%PDF-catan');
      expect(match).toHaveBeenCalledTimes(2);
    });

    it('takes a copy saved without a type for a PDF', async () => {
      await (await caches.open(RULEBOOKS)).put('/rules/catan.pdf', new Response(new TextEncoder().encode(PDF)));
      expect((await get('/rules/catan.pdf')).response!.headers.get('Content-Type')).toBe('application/pdf');
    });

    it('opened, completes a reader an update left incomplete', async () => {
      await caches.delete(SHELL);
      serve(...READER);
      const { event } = await get('/rules/azul.pdf');
      await event.done();
      expect(caches.paths(SHELL)).toEqual([...READER].sort());
    });
  });

  describe('not saved', () => {
    /** The network's rulebook, of `size` bytes as its headers say. */
    function online(path: string, size: number) {
      network.set(path, () => new Response(PDF, { headers: { 'Content-Length': String(size) } }));
      serve(...READER);
    }

    it("is the network's, and a small one is saved whole on its first open", async () => {
      await load();
      online('/rules/catan.pdf', PDF.length);
      const { event, response } = await get('/rules/catan.pdf');
      expect(await response!.text()).toBe(PDF);
      await event.done();
      expect(caches.paths(RULEBOOKS)).toEqual(['/rules/catan.pdf']);
      expect(caches.paths(SHELL)).toEqual([...READER].sort());
    });

    it.each([
      ['a large one', 3_000_000, {}, {}],
      ['one opened ahead of a tap', 100, { 'X-Warm': '1' }, {}],
      ['one opened while the browser saves data', 100, {}, { connection: { saveData: true } }],
    ])('is not saved when it is %s', async (_, size, headers, navigator) => {
      scope.navigator = navigator;
      await load();
      online('/rules/catan.pdf', size);
      const { event, response } = await get('/rules/catan.pdf', { headers });
      expect(response!.ok).toBe(true);
      await event.done();
      expect(event.waits).toEqual([]);
      expect(caches.paths(RULEBOOKS)).toBeNull();
    });
  });
});

describe('messages', () => {
  /** A MessagePort's sending end, keeping what is posted on it. */
  function port() {
    const replies: unknown[] = [];
    return { replies, postMessage: (reply: unknown) => replies.push(reply) };
  }

  it('answers the rules page on its port, saving the rulebook when asked', async () => {
    await load();
    serve('/rules/catan.pdf', ...READER);
    const page = port();
    await dispatch(
      'message',
      new FakeMessageEvent({ type: SAVE_MESSAGE, path: '/rules/catan.pdf', save: true }, [page]),
    ).done();
    expect(page.replies).toEqual([
      { path: '/rules/catan.pdf', state: 'saving' },
      { path: '/rules/catan.pdf', state: 'saved' },
    ]);
    expect(caches.paths(RULEBOOKS)).toEqual(['/rules/catan.pdf']);
  });

  it('answers nothing sent without a port', async () => {
    await load();
    const event = dispatch(
      'message',
      new FakeMessageEvent({ type: SAVE_MESSAGE, path: '/rules/catan.pdf', save: true }),
    );
    expect(event.waits).toEqual([]);
  });

  it("completes this build's reader, waiting, when an older build's worker says it saved a rulebook", async () => {
    await load();
    await caches.open(OLD_SHELL);
    await saveRulebook('/rules/azul.pdf');
    serve(...READER);
    // A newer build still on its way in: the older shells may be its.
    scope.registration.waiting = { postMessage: () => {} };
    await dispatch('message', new FakeMessageEvent({ type: READER_MESSAGE })).done();
    expect(caches.paths(SHELL)).toEqual([...READER].sort());
    expect(await caches.keys()).toContain(OLD_SHELL);
  });

  it('completes the reader once however often asked at once', async () => {
    await load();
    await saveRulebook('/rules/azul.pdf');
    serve(...READER);
    const first = dispatch('message', new FakeMessageEvent({ type: READER_MESSAGE }));
    const second = dispatch('message', new FakeMessageEvent({ type: READER_MESSAGE }));
    expect(second.waits[0]).toBe(first.waits[0]);
    await first.done();
    expect(fetched).toEqual(READER);
  });

  it('tells a newer build, installing or waiting, of each rulebook it saves', async () => {
    await load();
    const installing = { postMessage: vi.fn() };
    // A browser that can't message one worker from another.
    const waiting = {
      postMessage: vi.fn(() => {
        throw new DOMException('Not supported', 'NotSupportedError');
      }),
    };
    scope.registration = { installing, waiting };
    serve('/rules/catan.pdf', ...READER);
    const page = port();
    await dispatch(
      'message',
      new FakeMessageEvent({ type: SAVE_MESSAGE, path: '/rules/catan.pdf', save: true }, [page]),
    ).done();
    expect(page.replies.at(-1)).toEqual({ path: '/rules/catan.pdf', state: 'saved' });
    expect(installing.postMessage).toHaveBeenCalledExactlyOnceWith({ type: READER_MESSAGE });
    expect(waiting.postMessage).toHaveBeenCalledExactlyOnceWith({ type: READER_MESSAGE });
  });
});
