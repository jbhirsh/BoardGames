import { describe, it, expect, vi } from 'vitest';
import {
  activate,
  ART_VERSION,
  ASSETS,
  healReader,
  install,
  isReaderMessage,
  pruneShells,
  READER_MESSAGE,
  readerSaved,
  RULEBOOK_VERSION,
  RULEBOOKS,
  SAVE_MESSAGE,
  saveReader,
  saveRulebook,
  saver,
  stamped,
  type Build,
  type SaveReply,
} from '../sw/shell';

const ORIGIN = 'https://game-room.example';
const pathOf = (request: RequestInfo | URL) =>
  new URL(typeof request === 'object' && 'url' in request ? request.url : String(request), ORIGIN).pathname;

/** What the fake network answers, by path; empty when offline. */
type Network = Map<string, string>;

/** A Cache and CacheStorage over Maps, fetching from `network` as Cache.addAll does: all or nothing. */
class FakeCache {
  entries = new Map<string, Response>();
  network: () => Network;
  constructor(network: () => Network) {
    this.network = network;
  }
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
    return [...this.entries.keys()].map((path) => ({ url: ORIGIN + path }) as Request);
  }
  async addAll(requests: string[]) {
    const network = this.network();
    const missing = requests.filter((path) => !network.has(path));
    if (missing.length) throw new TypeError(`Failed to fetch ${missing.join(', ')}`);
    for (const path of requests) this.entries.set(path, new Response(network.get(path)));
  }
}

class FakeCaches {
  caches = new Map<string, FakeCache>();
  network: Network = new Map();
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache(() => this.network));
    return this.caches.get(name)!;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
  async has(name: string) {
    return this.caches.has(name);
  }
  async match(request: RequestInfo | URL) {
    for (const cache of this.caches.values()) {
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
  /** Saves a rulebook as sw.ts does, with the hash `build` has for it. */
  async saveRulebook(build: Build, path: string) {
    await (
      await this.open(RULEBOOKS)
    ).put(path, new Response('%PDF-', { headers: { [RULEBOOK_VERSION]: build.rulebooks[path] } }));
  }
}

const storage = (fake: FakeCaches) => fake as unknown as CacheStorage;

function build(version: string, worker: string): Build {
  return {
    shell: `gameroom-shell-${version}`,
    precache: [`/assets/index-${version}.js`, '/words/enable.txt'],
    reader: [`/assets/${worker}.js`, '/pdfjs/wasm/openjpeg.wasm'],
    rulebooks: { '/rules/azul.pdf': 'azul1', '/rules/catan.pdf': 'catan1' },
    art: { '/images/wishlist/ark-nova.jpg': 'ark1', '/images/wishlist/cascadia.jpg': `cascadia-${version}` },
  };
}

// Two builds: B ships a new pdf.js worker.
const A = build('a', 'worker-a');
const B = build('b', 'worker-b');

/** A network serving `builds`' files. */
function online(fake: FakeCaches, ...builds: Build[]) {
  fake.network = new Map(['/', ...builds.flatMap((b) => [...b.precache, ...b.reader])].map((path) => [path, path]));
}
const offline = (fake: FakeCaches) => {
  fake.network = new Map();
};

describe('install', () => {
  it('saves the app, without the reader, for a visitor with no rulebook saved', async () => {
    const fake = new FakeCaches();
    online(fake, A);
    await install(A, storage(fake));
    expect(fake.paths(A.shell)).toEqual(['/', '/assets/index-a.js', '/words/enable.txt']);
  });

  it('saves the reader too once a rulebook is saved', async () => {
    const fake = new FakeCaches();
    online(fake, B);
    await fake.saveRulebook(A, '/rules/azul.pdf');
    await install(B, storage(fake));
    expect(fake.paths(B.shell)).toEqual([
      '/',
      '/assets/index-b.js',
      '/assets/worker-b.js',
      '/pdfjs/wasm/openjpeg.wasm',
      '/words/enable.txt',
    ]);
  });
});

describe('saveReader', () => {
  it("fetches only the reader's files the shell lacks", async () => {
    const fake = new FakeCaches();
    const shell = await fake.open(A.shell);
    await shell.put('/assets/worker-a.js', new Response('saved'));
    // Only the decoder is on the network: had the worker been fetched again, addAll would fail.
    fake.network = new Map([['/pdfjs/wasm/openjpeg.wasm', 'decoder']]);
    await saveReader(A, storage(fake));
    expect(await readerSaved(A, storage(fake))).toBe(true);
    expect(await (await shell.match('/assets/worker-a.js'))!.text()).toBe('saved');
  });
});

describe('an update', () => {
  it("(d) a rulebook saved under A: B installs with the reader, and A's shell goes", async () => {
    const fake = new FakeCaches();
    online(fake, A);
    await install(A, storage(fake));
    await activate(A, storage(fake));
    await fake.saveRulebook(A, '/rules/azul.pdf');
    await saveReader(A, storage(fake));

    online(fake, B);
    await install(B, storage(fake));
    offline(fake);
    await activate(B, storage(fake));

    expect(await readerSaved(B, storage(fake))).toBe(true);
    expect(await fake.keys()).not.toContain(A.shell);
    expect(fake.paths(RULEBOOKS)).toEqual(['/rules/azul.pdf']);
  });

  it("(a) a first rulebook saved while A still runs: B activating offline keeps A's shell for its reader, then heals", async () => {
    const fake = new FakeCaches();
    online(fake, A);
    await install(A, storage(fake));
    await activate(A, storage(fake));
    // B installs with no rulebook saved, so without the reader.
    online(fake, A, B);
    await install(B, storage(fake));
    // A still runs the tab: the first rulebook fills A's reader.
    await fake.saveRulebook(B, '/rules/azul.pdf');
    await saveReader(A, storage(fake));
    expect(await fake.keys()).toContain(B.shell);

    // The tab closes and B activates, offline.
    offline(fake);
    await activate(B, storage(fake));
    await expect(healReader(B, storage(fake))).rejects.toThrow();
    // Nothing the saved rulebook needs is gone: A's reader answers from its shell.
    expect(await readerSaved(B, storage(fake))).toBe(false);
    expect(await fake.keys()).toContain(A.shell);
    expect(await fake.match('/assets/worker-a.js')).toBeDefined();
    // But B's app asks for B's own pdf.js worker, which no cache holds: the
    // saved rulebook can't draw until B heals online. Hence telling B of the
    // save while it waits (below).
    expect(await fake.match('/assets/worker-b.js')).toBeUndefined();

    // Pruning again changes nothing while B's reader is incomplete.
    await pruneShells(B, storage(fake));
    expect(await fake.keys()).toContain(A.shell);

    // Back online, opening the saved rulebook completes B's reader, and A's shell can go.
    online(fake, B);
    await healReader(B, storage(fake));
    expect(await readerSaved(B, storage(fake))).toBe(true);
    await pruneShells(B, storage(fake));
    expect(await fake.keys()).not.toContain(A.shell);
  });

  it('(a) B, waiting, told of the first rulebook A saves, completes its reader then, so it has all it asks for activating offline', async () => {
    const fake = new FakeCaches();
    online(fake, A);
    await install(A, storage(fake));
    await activate(A, storage(fake));
    online(fake, A, B);
    await install(B, storage(fake));
    expect(await readerSaved(B, storage(fake))).toBe(false);

    // A saves the first rulebook and tells B, which heals (sw.ts: tellNewer, then B's message handler).
    const told: string[] = [];
    const saving = saver(
      A,
      storage(fake),
      async () => new Response('%PDF'),
      (path) => told.push(path),
    );
    expect(await saving.save('/rules/azul.pdf')).toBe('saved');
    expect(told).toEqual(['/rules/azul.pdf']);
    await healReader(B, storage(fake));
    expect(await readerSaved(B, storage(fake))).toBe(true);

    offline(fake);
    await activate(B, storage(fake));
    for (const path of B.reader) expect(await fake.match(path)).toBeDefined();
    expect(await fake.keys()).not.toContain(A.shell);
  });

  it("(a) online, B activating then healing ends with B's reader and A's shell gone", async () => {
    const fake = new FakeCaches();
    online(fake, A, B);
    await install(A, storage(fake));
    await install(B, storage(fake));
    await fake.saveRulebook(A, '/rules/catan.pdf');
    await saveReader(A, storage(fake));
    await activate(B, storage(fake));
    expect(await fake.keys()).toContain(A.shell);
    await healReader(B, storage(fake));
    expect(fake.paths(B.shell)).toContain('/assets/worker-b.js');
    await pruneShells(B, storage(fake));
    expect(await fake.keys()).not.toContain(A.shell);
  });

  it('lets older shells go at once when no rulebook is saved, and heals nothing', async () => {
    const fake = new FakeCaches();
    online(fake, A, B);
    await install(A, storage(fake));
    await install(B, storage(fake));
    await activate(B, storage(fake));
    expect(await fake.keys()).not.toContain(A.shell);
    await healReader(B, storage(fake));
    expect(await readerSaved(B, storage(fake))).toBe(false);
  });

  it('drops saved rulebooks whose file changed, and the old code and pdf.js files fetched along the way', async () => {
    const fake = new FakeCaches();
    online(fake, B);
    await install(B, storage(fake));
    await fake.saveRulebook(A, '/rules/azul.pdf');
    await (
      await fake.open(RULEBOOKS)
    ).put('/rules/catan.pdf', new Response('%PDF-', { headers: { [RULEBOOK_VERSION]: 'catan0' } }));
    const assets = await fake.open(ASSETS);
    for (const path of [
      '/assets/later-a.js',
      '/pdfjs/wasm/openjpeg_nowasm_fallback.js',
      '/pdfjs/standard_fonts/FoxitSymbol.pfb',
      '/images/assets/shelf.webp',
    ]) {
      await assets.put(path, new Response(path));
    }
    await assets.put('/images/wishlist/ark-nova.jpg', new Response('art', { headers: { [ART_VERSION]: 'ark1' } }));
    await activate(B, storage(fake));
    expect(fake.paths(RULEBOOKS)).toEqual(['/rules/azul.pdf']);
    expect(fake.paths(ASSETS)).toEqual(['/images/assets/shelf.webp', '/images/wishlist/ark-nova.jpg']);
  });

  it('keeps nothing for rulebooks the update dropped', async () => {
    const fake = new FakeCaches();
    online(fake, A, B);
    await install(A, storage(fake));
    await install(B, storage(fake));
    await (
      await fake.open(RULEBOOKS)
    ).put('/rules/azul.pdf', new Response('%PDF-', { headers: { [RULEBOOK_VERSION]: 'azul0' } }));
    await activate(B, storage(fake));
    expect(fake.paths(RULEBOOKS)).toEqual([]);
    expect(await fake.keys()).not.toContain(A.shell);
  });
});

describe('wishlist box art', () => {
  it("is kept marked with the build's hash of it, and everything else as it came", async () => {
    const art = stamped(
      A,
      '/images/wishlist/cascadia.jpg',
      new Response('jpeg', { status: 200, statusText: 'OK', headers: { 'Content-Type': 'image/jpeg' } }),
    );
    expect(art.headers.get(ART_VERSION)).toBe('cascadia-a');
    expect(art.headers.get('Content-Type')).toBe('image/jpeg');
    expect([art.status, art.statusText, await art.text()]).toEqual([200, 'OK', 'jpeg']);
    const code = new Response('js');
    expect(stamped(A, '/assets/later-a.js', code)).toBe(code);
    // Art in another folder isn't the wishlist's, nor are other origins' thumbnails (sw.ts never sees them).
    const other = new Response('webp');
    expect(stamped(A, '/images/catan.webp', other)).toBe(other);
  });

  it('saved as fetched, survives an update that keeps the file, and goes with one that changes or drops it', async () => {
    const fake = new FakeCaches();
    online(fake, A, B);
    await install(A, storage(fake));
    await activate(A, storage(fake));
    const assets = await fake.open(ASSETS);
    for (const path of [
      '/images/wishlist/ark-nova.jpg',
      '/images/wishlist/cascadia.jpg',
      '/images/wishlist/gone.jpg',
    ]) {
      await assets.put(path, stamped(A, path, new Response(path)));
    }
    // Saved before copies were marked: its file may have changed since.
    await assets.put('/images/wishlist/old.jpg', new Response('old'));
    await install(B, storage(fake));
    await activate(B, storage(fake));
    // Ark Nova's file is the same in both builds; Cascadia's changed, and B has no gone.jpg.
    expect(fake.paths(ASSETS)).toEqual(['/images/wishlist/ark-nova.jpg']);
    expect(await (await assets.match('/images/wishlist/ark-nova.jpg'))!.text()).toBe('/images/wishlist/ark-nova.jpg');
  });
});

describe('saveRulebook', () => {
  /** A network serving A's reader and `files`, counting each fetch of a rulebook. */
  function serving(fake: FakeCaches, files: Record<string, Response | (() => Response)>) {
    online(fake, A);
    const fetched: string[] = [];
    const fetcher = async (path: string) => {
      fetched.push(path);
      const file = files[path];
      if (!file) throw new TypeError('Failed to fetch');
      return typeof file === 'function' ? file() : file.clone();
    };
    return { fetched, fetcher };
  }

  it("saves the whole file, marked with the build's hash of it, then the reader", async () => {
    const fake = new FakeCaches();
    const { fetcher } = serving(fake, {
      '/rules/catan.pdf': new Response('%PDF-catan', { headers: { 'Content-Type': 'application/pdf' } }),
    });
    await saveRulebook('/rules/catan.pdf', A, storage(fake), fetcher);
    const copy = (await (await fake.open(RULEBOOKS)).match('/rules/catan.pdf'))!;
    expect(await copy.text()).toBe('%PDF-catan');
    expect(copy.status).toBe(200);
    expect(copy.headers.get(RULEBOOK_VERSION)).toBe('catan1');
    expect(copy.headers.get('Content-Type')).toBe('application/pdf');
    expect(await readerSaved(A, storage(fake))).toBe(true);
  });

  it('fetches a rulebook already saved no more, only completes its reader', async () => {
    const fake = new FakeCaches();
    const { fetched, fetcher } = serving(fake, {});
    await fake.saveRulebook(A, '/rules/azul.pdf');
    await saveRulebook('/rules/azul.pdf', A, storage(fake), fetcher);
    expect(fetched).toEqual([]);
    expect(await readerSaved(A, storage(fake))).toBe(true);
  });

  it("fails, saving nothing, for an answer that isn't the whole file", async () => {
    const fake = new FakeCaches();
    const { fetcher } = serving(fake, {
      '/rules/catan.pdf': new Response('gone', { status: 404 }),
      '/rules/azul.pdf': new Response('%PDF', { status: 206 }),
    });
    await expect(saveRulebook('/rules/catan.pdf', A, storage(fake), fetcher)).rejects.toThrow('/rules/catan.pdf: 404');
    await expect(saveRulebook('/rules/azul.pdf', A, storage(fake), fetcher)).rejects.toThrow('/rules/azul.pdf: 206');
    expect(fake.paths(RULEBOOKS)).toEqual([]);
    expect(await readerSaved(A, storage(fake))).toBe(false);
  });

  it("fails when the reader can't be had", async () => {
    const fake = new FakeCaches();
    const { fetcher } = serving(fake, { '/rules/catan.pdf': new Response('%PDF') });
    offline(fake);
    await expect(saveRulebook('/rules/catan.pdf', A, storage(fake), fetcher)).rejects.toThrow();
  });

  it('marks a rulebook the build has no hash for with an empty one, which the next activation drops', async () => {
    const fake = new FakeCaches();
    const { fetcher } = serving(fake, { '/rules/new.pdf': new Response('%PDF') });
    await saveRulebook('/rules/new.pdf', A, storage(fake), fetcher);
    expect((await (await fake.open(RULEBOOKS)).match('/rules/new.pdf'))!.headers.get(RULEBOOK_VERSION)).toBe('');
    await activate(A, storage(fake));
    expect(fake.paths(RULEBOOKS)).toEqual([]);
  });
});

describe('saver', () => {
  /** A saver over a network whose rulebook fetches wait until `release`d. */
  function setUp(answer: () => Response = () => new Response('%PDF')) {
    const fake = new FakeCaches();
    online(fake, A);
    const fetched: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetcher = async (path: string) => {
      fetched.push(path);
      await gate;
      return answer();
    };
    const replies: SaveReply[] = [];
    const reply = (r: SaveReply) => {
      replies.push(r);
    };
    return { fake, fetched, release, replies, reply, saving: saver(A, storage(fake), fetcher) };
  }
  const ask = (path: string, save: boolean) => ({ type: SAVE_MESSAGE, path, save });
  const states = (replies: SaveReply[]) => replies.map((r) => `${r.path} ${r.state}`);

  it('fetches a rulebook once however often it is asked to save it, then saves again when asked after', async () => {
    const { fetched, release, saving, fake } = setUp();
    const first = saving.save('/rules/catan.pdf');
    const second = saving.save('/rules/catan.pdf');
    expect(second).toBe(first);
    release();
    expect(await first).toBe('saved');
    expect(fetched).toEqual(['/rules/catan.pdf']);
    await (await fake.open(RULEBOOKS)).delete('/rules/catan.pdf');
    expect(await saving.save('/rules/catan.pdf')).toBe('saved');
    expect(fetched).toEqual(['/rules/catan.pdf', '/rules/catan.pdf']);
  });

  it("saves the reader's files once for rulebooks saved at once, and again for a save after", async () => {
    const { fake, release, saving } = setUp();
    const shell = await fake.open(A.shell);
    const addAll = vi.spyOn(shell, 'addAll');
    const both = Promise.all([saving.save('/rules/catan.pdf'), saving.save('/rules/azul.pdf')]);
    release();
    expect(await both).toEqual(['saved', 'saved']);
    expect(addAll.mock.calls).toEqual([[A.reader]]);
    expect(fake.paths(RULEBOOKS)).toEqual(['/rules/azul.pdf', '/rules/catan.pdf']);
    // Lost since (cleared storage), a file is fetched again by the next save.
    await shell.delete(A.reader[0]);
    await (await fake.open(RULEBOOKS)).delete('/rules/azul.pdf');
    expect(await saving.save('/rules/azul.pdf')).toBe('saved');
    expect(addAll.mock.calls).toEqual([[A.reader], [[A.reader[0]]]]);
  });

  it("fails each save sharing a reader that can't be had", async () => {
    const { fake, release, saving } = setUp();
    vi.spyOn(await fake.open(A.shell), 'addAll').mockRejectedValue(new TypeError('Failed to fetch'));
    const both = Promise.all([saving.save('/rules/catan.pdf'), saving.save('/rules/azul.pdf')]);
    release();
    expect(await both).toEqual(['failed', 'failed']);
  });

  it('says the device is full when the browser has no room for the rulebook, or for the reader', async () => {
    const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    const { fake, release, replies, reply, saving } = setUp();
    release();
    const rulebooks = await fake.open(RULEBOOKS);
    const put = vi.spyOn(rulebooks, 'put').mockRejectedValueOnce(quota());
    await saving.answer(ask('/rules/catan.pdf', true), reply);
    expect(states(replies)).toEqual(['/rules/catan.pdf saving', '/rules/catan.pdf full']);
    expect(fake.paths(RULEBOOKS)).toEqual([]);
    put.mockRestore();
    vi.spyOn(await fake.open(A.shell), 'addAll').mockRejectedValueOnce(quota());
    expect(await saving.save('/rules/azul.pdf')).toBe('full');
  });

  it('says a rulebook not saved is unsaved, and saves nothing unasked', async () => {
    const { fetched, replies, reply, saving } = setUp();
    await saving.answer(ask('/rules/catan.pdf', false), reply);
    expect(states(replies)).toEqual(['/rules/catan.pdf unsaved']);
    expect(fetched).toEqual([]);
  });

  it('says a saved rulebook is saved', async () => {
    const { fake, fetched, replies, reply, saving } = setUp();
    await fake.saveRulebook(A, '/rules/azul.pdf');
    await saving.answer(ask('/rules/azul.pdf', true), reply);
    expect(states(replies)).toEqual(['/rules/azul.pdf saved']);
    expect(fetched).toEqual([]);
  });

  it('saves the rulebook when asked, the reader with it, saying it is saving and then saved', async () => {
    const { fake, release, replies, reply, saving } = setUp();
    const answered = saving.answer(ask('/rules/catan.pdf', true), reply);
    await vi.waitFor(() => expect(states(replies)).toEqual(['/rules/catan.pdf saving']));
    release();
    await answered;
    expect(states(replies)).toEqual(['/rules/catan.pdf saving', '/rules/catan.pdf saved']);
    expect(fake.paths(RULEBOOKS)).toEqual(['/rules/catan.pdf']);
    expect(await readerSaved(A, storage(fake))).toBe(true);
  });

  it('says a save that fails has failed, and keeps nothing of it', async () => {
    const { fake, release, replies, reply, saving } = setUp(() => new Response('', { status: 500 }));
    release();
    await saving.answer(ask('/rules/catan.pdf', true), reply);
    expect(states(replies)).toEqual(['/rules/catan.pdf saving', '/rules/catan.pdf failed']);
    expect(fake.paths(RULEBOOKS)).toEqual([]);
  });

  it('tells a page that only asks of a save under way, one begun on opening the rulebook, and how it ends', async () => {
    const { fetched, release, replies, reply, saving } = setUp();
    const opened = saving.save('/rules/azul.pdf');
    const answered = saving.answer(ask('/rules/azul.pdf', false), reply);
    const tapped = saving.answer(ask('/rules/azul.pdf', true), reply);
    release();
    await Promise.all([opened, answered, tapped]);
    expect(states(replies)).toEqual([
      '/rules/azul.pdf saving',
      '/rules/azul.pdf saving',
      '/rules/azul.pdf saved',
      '/rules/azul.pdf saved',
    ]);
    expect(fetched).toEqual(['/rules/azul.pdf']);
  });

  it('tells of each save that ends saved once, however many asked for it, and of none that failed', async () => {
    const fake = new FakeCaches();
    online(fake, A);
    const told: string[] = [];
    let ok = true;
    const saving = saver(
      A,
      storage(fake),
      async () => new Response('%PDF', { status: ok ? 200 : 500 }),
      (path) => told.push(path),
    );
    const replies: SaveReply[] = [];
    await Promise.all([
      saving.save('/rules/azul.pdf'),
      saving.answer(ask('/rules/azul.pdf', true), (r) => replies.push(r)),
    ]);
    expect(told).toEqual(['/rules/azul.pdf']);
    ok = false;
    expect(await saving.save('/rules/catan.pdf')).toBe('failed');
    expect(told).toEqual(['/rules/azul.pdf']);
  });

  it("answers nothing but its own message, for one of the build's rulebooks", async () => {
    const { fetched, release, replies, reply, saving } = setUp();
    release();
    for (const message of [
      null,
      'save',
      42,
      { type: 'other', path: '/rules/catan.pdf', save: true },
      { type: SAVE_MESSAGE, path: '/rules/elsewhere.pdf', save: true },
      { type: SAVE_MESSAGE, path: '/api/votes', save: true },
      { type: SAVE_MESSAGE, path: 'toString', save: true },
      { type: SAVE_MESSAGE, path: 7, save: true },
      { type: SAVE_MESSAGE, path: '/rules/catan.pdf', save: 'yes' },
      { type: SAVE_MESSAGE, path: '/rules/catan.pdf' },
    ])
      await saving.answer(message, reply);
    expect(replies).toEqual([]);
    expect(fetched).toEqual([]);
  });
});

describe('isReaderMessage', () => {
  it("knows only the message an older build's worker sends a newer one", () => {
    expect(isReaderMessage({ type: READER_MESSAGE })).toBe(true);
    for (const message of [
      null,
      undefined,
      READER_MESSAGE,
      42,
      {},
      { type: SAVE_MESSAGE, path: '/rules/azul.pdf', save: true },
    ]) {
      expect(isReaderMessage(message)).toBe(false);
    }
  });
});
