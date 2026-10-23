import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  askWorker,
  head,
  outOfReach,
  PROBE_MS,
  rulebookBytes,
  SAVE_ON_OPEN_BELOW,
  savedCopy,
  waitsForSave,
  type Online,
  type SaveState,
} from '../pdfjs/saved';
import { SAVE_ON_OPEN_BELOW as WORKER_SAVES_BELOW, savesOnOpen } from '../utils/offline';
import { SAVE_MESSAGE } from '../sw/shell';

const nav = (onLine: boolean, controller: unknown = {}): Online => ({ onLine, serviceWorker: { controller } });
/** A service worker's cache store holding `saved`, in its rulebooks cache. */
const store = (...saved: string[]) =>
  ({
    match: vi.fn(async (src: string, options?: MultiCacheQueryOptions) =>
      options?.cacheName === 'gameroom-rulebooks' && saved.includes(src) ? new Response('%PDF') : undefined,
    ),
  }) as unknown as CacheStorage;
/** Whether the network answers, as `reached` says it. */
const answers = (reached: boolean) => vi.fn(async () => reached);
/** A request the network never answers, but which stops when told to. */
const hangs = () =>
  vi.fn(
    (_src: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
  ) as unknown as typeof fetch & { mock: { calls: [string, RequestInit][] } };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('savedCopy', () => {
  it("finds a rulebook in the service worker's saved rulebooks, matched as the service worker matches", async () => {
    const saved = store('/a.pdf');
    expect(await savedCopy('/a.pdf', nav(true), saved)).toBe(true);
    expect(saved.match).toHaveBeenCalledWith('/a.pdf', { cacheName: 'gameroom-rulebooks', ignoreVary: true });
    expect(await savedCopy('/a.pdf', nav(true), store('/b.pdf'))).toBe(false);
  });

  it('counts nothing as saved without a service worker in charge, a store, or one that answers', async () => {
    expect(await savedCopy('/a.pdf', nav(true, null), store('/a.pdf'))).toBe(false);
    expect(await savedCopy('/a.pdf', { onLine: true }, store('/a.pdf'))).toBe(false);
    expect(await savedCopy('/a.pdf', nav(true), undefined)).toBe(false);
    const broken = {
      match: async () => {
        throw new Error('blocked');
      },
    } as unknown as CacheStorage;
    expect(await savedCopy('/a.pdf', nav(true), broken)).toBe(false);
  });

  it('asks the browser by default', async () => {
    // jsdom has neither a service worker nor a cache store.
    expect(await savedCopy('/a.pdf')).toBe(false);
  });
});

describe('head', () => {
  it("gives the network's answer, whatever it says", async () => {
    const answer = new Response(null, { status: 404 });
    const probe = vi.fn(async () => answer) as unknown as typeof fetch;
    expect(await head('/a.pdf', undefined, probe)).toBe(answer);
    expect(probe).toHaveBeenCalledWith('/a.pdf', expect.objectContaining({ method: 'HEAD' }));
  });

  it('gives null when there is no network', async () => {
    const probe = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await head('/a.pdf', undefined, probe)).toBeNull();
  });

  it("gives up on a network that doesn't answer, after PROBE_MS, and stops the request", async () => {
    vi.useFakeTimers();
    const probe = hangs();
    let settled: Response | null | undefined;
    void head('/a.pdf', undefined, probe).then((res) => {
      settled = res;
    });
    await vi.advanceTimersByTimeAsync(PROBE_MS - 1);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBeNull();
    expect(probe.mock.calls[0][1].signal!.aborted).toBe(true);
    expect(PROBE_MS).toBe(5000);
  });

  it("gives up even on a request that won't stop", async () => {
    vi.useFakeTimers();
    const probe = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const asked = head('/a.pdf', undefined, probe, 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(await asked).toBeNull();
  });

  it('stops when called off, or at once if it already was', async () => {
    const probe = hangs();
    const controller = new AbortController();
    const asked = head('/a.pdf', controller.signal, probe);
    controller.abort();
    expect(await asked).toBeNull();
    expect(probe.mock.calls[0][1].signal!.aborted).toBe(true);

    const never = hangs();
    expect(await head('/a.pdf', AbortSignal.abort(), never)).toBeNull();
    expect(never).not.toHaveBeenCalled();
  });

  it('asks the browser by default', async () => {
    const answer = new Response(null);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer);
    expect(await head('/a.pdf')).toBe(answer);
    expect(fetchSpy).toHaveBeenCalledWith('/a.pdf', expect.objectContaining({ method: 'HEAD' }));
  });
});

describe('outOfReach', () => {
  it('is never true of a saved rulebook, which the service worker answers offline', async () => {
    const reached = answers(false);
    expect(await outOfReach('/a.pdf', reached, nav(false), store('/a.pdf'))).toBe(false);
    expect(await outOfReach('/a.pdf', reached, nav(true), store('/a.pdf'))).toBe(false);
    expect(reached).not.toHaveBeenCalled();
  });

  it('is true of one not saved while the browser is offline, without asking the network', async () => {
    const reached = answers(true);
    expect(await outOfReach('/a.pdf', reached, nav(false), store())).toBe(true);
    expect(reached).not.toHaveBeenCalled();
  });

  it('asks the network when the browser says it is online, which a dead Wi-Fi also says', async () => {
    const reached = answers(false);
    expect(await outOfReach('/a.pdf', reached, nav(true), store())).toBe(true);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(await outOfReach('/a.pdf', answers(true), nav(true), store())).toBe(false);
  });

  it("asks the browser by default, with a HEAD that gives up on a network that doesn't answer", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(hangs());
    let unreachable: boolean | undefined;
    void outOfReach('/a.pdf').then((u) => {
      unreachable = u;
    });
    await vi.advanceTimersByTimeAsync(PROBE_MS);
    expect(unreachable).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith('/a.pdf', expect.objectContaining({ method: 'HEAD' }));
  });

  it('counts any answer from the network, by default, as within reach', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
    expect(await outOfReach('/a.pdf')).toBe(false);
  });
});

describe('waitsForSave', () => {
  const sizes = { '/small.pdf': SAVE_ON_OPEN_BELOW - 1, '/large.pdf': SAVE_ON_OPEN_BELOW };

  it("holds the service worker's limit, so the page says what opening a rulebook did", () => {
    expect(SAVE_ON_OPEN_BELOW).toBe(WORKER_SAVES_BELOW);
    const opened = (bytes: number) =>
      savesOnOpen(new Headers(), { status: 200, headers: new Headers({ 'Content-Length': String(bytes) }) }, false);
    expect(opened(sizes['/small.pdf'])).toBe(true);
    expect(opened(sizes['/large.pdf'])).toBe(false);
  });

  it('is true of a rulebook too large to save itself on opening, and only that', () => {
    expect(waitsForSave('/large.pdf', sizes, {})).toBe(true);
    expect(waitsForSave('/small.pdf', sizes, {})).toBe(false);
    expect(waitsForSave('/unknown.pdf', sizes, {})).toBe(false);
  });

  it('is true of any while the browser saves data, when none saves itself', () => {
    expect(waitsForSave('/small.pdf', sizes, { connection: { saveData: true } })).toBe(true);
    expect(waitsForSave('/small.pdf', sizes, { connection: { saveData: false } })).toBe(false);
  });

  it("knows each rulebook's size from the build, and asks the browser", () => {
    // Pandemic's 16 MB, Azul's 1.5 MB (public/rules).
    expect(waitsForSave('/rules/pandemic.pdf')).toBe(true);
    expect(waitsForSave('/rules/azul.pdf')).toBe(false);
  });
});

describe('rulebookBytes', () => {
  it("gives a rulebook's size from the build", () => {
    // 7 Wonders' 4.6 MB (public/rules).
    expect(rulebookBytes('/rules/7-wonders.pdf')).toBe(4_616_897);
  });

  it('gives none for a path the build has no file at', () => {
    const sizes = { '/rules/a.pdf': 10 };
    expect(rulebookBytes('/rules/a.pdf', sizes)).toBe(10);
    expect(rulebookBytes('/rules/b.pdf', sizes)).toBeNull();
    expect(rulebookBytes('toString', sizes)).toBeNull();
  });
});

describe('askWorker', () => {
  /** A service worker in charge that answers each message with `states` on its port. */
  const worker = (...states: SaveState[]) => ({
    postMessage: vi.fn((message: { path: string }, [port]: Transferable[]) => {
      for (const state of states) (port as MessagePort).postMessage({ path: message.path, state });
    }),
  });

  /**
   * The next message channel made, with ports that hand each message over
   * at once, closed or not, as a real port may hand over one already on its
   * way when closed: "nothing heard" is then known, rather than waited for.
   * Gives the port askWorker listens on.
   */
  const heldChannel = () => {
    const port1 = { onmessage: null as ((event: { data: unknown }) => void) | null, close: vi.fn() };
    const port2 = { postMessage: (data: unknown) => port1.onmessage?.({ data }) };
    vi.stubGlobal(
      'MessageChannel',
      class {
        port1 = port1;
        port2 = port2;
      },
    );
    return port1;
  };

  it("asks after a rulebook in the service worker's own message, sending the port it answers on", () => {
    const w = worker();
    askWorker(w, '/rules/catan.pdf', true, () => {});
    expect(w.postMessage).toHaveBeenCalledWith({ type: SAVE_MESSAGE, path: '/rules/catan.pdf', save: true }, [
      expect.any(MessagePort),
    ]);
  });

  it('hears each answer up to the last', async () => {
    const heard = vi.fn();
    askWorker(worker('saving', 'saved'), '/rules/catan.pdf', true, heard);
    await vi.waitFor(() => expect(heard.mock.calls).toEqual([['saving'], ['saved']]));
  });

  it('stops listening after an answer that ends it, even to one already on its way', () => {
    const port = heldChannel();
    const heard = vi.fn();
    askWorker(worker('unsaved', 'saving'), '/rules/catan.pdf', false, heard);
    expect(heard.mock.calls).toEqual([['unsaved']]);
    expect(port.close).toHaveBeenCalledOnce();
  });

  it('pays no heed to an answer about another rulebook', async () => {
    const heard = vi.fn();
    const w = {
      postMessage: (_m: unknown, [port]: Transferable[]) => {
        (port as MessagePort).postMessage({ path: '/rules/azul.pdf', state: 'saved' });
        (port as MessagePort).postMessage({ path: '/rules/catan.pdf', state: 'failed' });
      },
    };
    askWorker(w, '/rules/catan.pdf', true, heard);
    await vi.waitFor(() => expect(heard).toHaveBeenCalled());
    expect(heard.mock.calls).toEqual([['failed']]);
  });

  it('hears nothing once told to stop, even an answer already on its way', () => {
    const port = heldChannel();
    const heard = vi.fn();
    let send: (state: SaveState) => void = () => {};
    const stop = askWorker(
      {
        postMessage: (_m: unknown, [port]: Transferable[]) => {
          send = (state) => (port as MessagePort).postMessage({ path: '/rules/catan.pdf', state });
        },
      },
      '/rules/catan.pdf',
      false,
      heard,
    );
    stop();
    expect(port.close).toHaveBeenCalledOnce();
    send('saved');
    expect(heard).not.toHaveBeenCalled();
  });
});
