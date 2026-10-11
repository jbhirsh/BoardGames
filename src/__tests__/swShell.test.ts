import { describe, it, expect } from 'vitest';
import { activate, ASSETS, healReader, install, pruneShells, readerSaved, RULEBOOK_VERSION, RULEBOOKS, saveReader, type Build } from '../sw/shell';

const ORIGIN = 'https://game-room.example';
const pathOf = (request: RequestInfo | URL) => new URL(typeof request === 'object' && 'url' in request ? request.url : String(request), ORIGIN).pathname;

/** What the fake network answers, by path; empty when offline. */
type Network = Map<string, string>;

/** A Cache and CacheStorage over Maps, fetching from `network` as Cache.addAll does: all or nothing. */
class FakeCache {
  entries = new Map<string, Response>();
  network: () => Network;
  constructor(network: () => Network) { this.network = network; }
  async match(request: RequestInfo | URL) { return this.entries.get(pathOf(request))?.clone(); }
  async put(request: RequestInfo | URL, response: Response) { this.entries.set(pathOf(request), response); }
  async delete(request: RequestInfo | URL) { return this.entries.delete(pathOf(request)); }
  async keys() { return [...this.entries.keys()].map((path) => ({ url: ORIGIN + path }) as Request); }
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
  async keys() { return [...this.caches.keys()]; }
  async delete(name: string) { return this.caches.delete(name); }
  async has(name: string) { return this.caches.has(name); }
  async match(request: RequestInfo | URL) {
    for (const cache of this.caches.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
  /** The paths in cache `name`, sorted, or null if there is none. */
  paths(name: string) { const cache = this.caches.get(name); return cache ? [...cache.entries.keys()].sort() : null; }
  /** Saves a rulebook as sw.ts does, with the hash `build` has for it. */
  async saveRulebook(build: Build, path: string) {
    await (await this.open(RULEBOOKS)).put(path, new Response('%PDF-', { headers: { [RULEBOOK_VERSION]: build.rulebooks[path] } }));
  }
}

const storage = (fake: FakeCaches) => fake as unknown as CacheStorage;

function build(version: string, worker: string): Build {
  return {
    shell: `gameroom-shell-${version}`,
    precache: [`/assets/index-${version}.js`, '/words/enable.txt'],
    reader: [`/assets/${worker}.js`, '/pdfjs/wasm/openjpeg.wasm'],
    rulebooks: { '/rules/azul.pdf': 'azul1', '/rules/catan.pdf': 'catan1' },
  };
}

// Two builds: B ships a new pdf.js worker.
const A = build('a', 'worker-a');
const B = build('b', 'worker-b');

/** A network serving `builds`' files. */
function online(fake: FakeCaches, ...builds: Build[]) {
  fake.network = new Map(['/', ...builds.flatMap((b) => [...b.precache, ...b.reader])].map((path) => [path, path]));
}
const offline = (fake: FakeCaches) => { fake.network = new Map(); };

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
    expect(fake.paths(B.shell)).toEqual(['/', '/assets/index-b.js', '/assets/worker-b.js', '/pdfjs/wasm/openjpeg.wasm', '/words/enable.txt']);
  });
});

describe('saveReader', () => {
  it('fetches only the reader\'s files the shell lacks', async () => {
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
  it('(d) a rulebook saved under A: B installs with the reader, and A\'s shell goes', async () => {
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

  it('(a) a first rulebook saved while A still runs: B activating offline keeps A\'s shell for its reader, then heals', async () => {
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

  it('(a) online, B activating then healing ends with B\'s reader and A\'s shell gone', async () => {
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
    await (await fake.open(RULEBOOKS)).put('/rules/catan.pdf', new Response('%PDF-', { headers: { [RULEBOOK_VERSION]: 'catan0' } }));
    const assets = await fake.open(ASSETS);
    for (const path of ['/assets/later-a.js', '/pdfjs/wasm/openjpeg_nowasm_fallback.js', '/pdfjs/standard_fonts/FoxitSymbol.pfb', '/images/wishlist/ark-nova.jpg', '/images/assets/shelf.webp']) {
      await assets.put(path, new Response(path));
    }
    await activate(B, storage(fake));
    expect(fake.paths(RULEBOOKS)).toEqual(['/rules/azul.pdf']);
    expect(fake.paths(ASSETS)).toEqual(['/images/assets/shelf.webp', '/images/wishlist/ark-nova.jpg']);
  });

  it('keeps nothing for rulebooks the update dropped', async () => {
    const fake = new FakeCaches();
    online(fake, A, B);
    await install(A, storage(fake));
    await install(B, storage(fake));
    await (await fake.open(RULEBOOKS)).put('/rules/azul.pdf', new Response('%PDF-', { headers: { [RULEBOOK_VERSION]: 'azul0' } }));
    await activate(B, storage(fake));
    expect(fake.paths(RULEBOOKS)).toEqual([]);
    expect(await fake.keys()).not.toContain(A.shell);
  });
});
