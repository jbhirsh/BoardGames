import { describe, it, expect, vi, afterEach } from 'vitest';
import { head, outOfReach, PROBE_MS, savedCopy, type Online } from '../pdfjs/saved';

const nav = (onLine: boolean, controller: unknown = {}): Online => ({ onLine, serviceWorker: { controller } });
/** A service worker's cache store holding `saved`, in its rulebooks cache. */
const store = (...saved: string[]) => ({
  match: vi.fn(async (src: string, options?: MultiCacheQueryOptions) =>
    (options?.cacheName === 'gameroom-rulebooks' && saved.includes(src) ? new Response('%PDF') : undefined)),
}) as unknown as CacheStorage;
/** Whether the network answers, as `reached` says it. */
const answers = (reached: boolean) => vi.fn(async () => reached);
/** A request the network never answers, but which stops when told to. */
const hangs = () => vi.fn((_src: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
  init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
})) as unknown as typeof fetch & { mock: { calls: [string, RequestInit][] } };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('savedCopy', () => {
  it('finds a rulebook in the service worker\'s saved rulebooks, matched as the service worker matches', async () => {
    const saved = store('/a.pdf');
    expect(await savedCopy('/a.pdf', nav(true), saved)).toBe(true);
    expect(saved.match).toHaveBeenCalledWith('/a.pdf', { cacheName: 'gameroom-rulebooks', ignoreVary: true });
    expect(await savedCopy('/a.pdf', nav(true), store('/b.pdf'))).toBe(false);
  });

  it('counts nothing as saved without a service worker in charge, a store, or one that answers', async () => {
    expect(await savedCopy('/a.pdf', nav(true, null), store('/a.pdf'))).toBe(false);
    expect(await savedCopy('/a.pdf', { onLine: true }, store('/a.pdf'))).toBe(false);
    expect(await savedCopy('/a.pdf', nav(true), undefined)).toBe(false);
    const broken = { match: async () => { throw new Error('blocked'); } } as unknown as CacheStorage;
    expect(await savedCopy('/a.pdf', nav(true), broken)).toBe(false);
  });

  it('asks the browser by default', async () => {
    // jsdom has neither a service worker nor a cache store.
    expect(await savedCopy('/a.pdf')).toBe(false);
  });
});

describe('head', () => {
  it('gives the network\'s answer, whatever it says', async () => {
    const answer = new Response(null, { status: 404 });
    const probe = vi.fn(async () => answer) as unknown as typeof fetch;
    expect(await head('/a.pdf', undefined, probe)).toBe(answer);
    expect(probe).toHaveBeenCalledWith('/a.pdf', expect.objectContaining({ method: 'HEAD' }));
  });

  it('gives null when there is no network', async () => {
    const probe = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    expect(await head('/a.pdf', undefined, probe)).toBeNull();
  });

  it('gives up on a network that doesn\'t answer, after PROBE_MS, and stops the request', async () => {
    vi.useFakeTimers();
    const probe = hangs();
    let settled: Response | null | undefined;
    void head('/a.pdf', undefined, probe).then((res) => { settled = res; });
    await vi.advanceTimersByTimeAsync(PROBE_MS - 1);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBeNull();
    expect(probe.mock.calls[0][1].signal!.aborted).toBe(true);
    expect(PROBE_MS).toBe(5000);
  });

  it('gives up even on a request that won\'t stop', async () => {
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

  it('asks the browser by default, with a HEAD that gives up on a network that doesn\'t answer', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(hangs());
    let unreachable: boolean | undefined;
    void outOfReach('/a.pdf').then((u) => { unreachable = u; });
    await vi.advanceTimersByTimeAsync(PROBE_MS);
    expect(unreachable).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith('/a.pdf', expect.objectContaining({ method: 'HEAD' }));
  });

  it('counts any answer from the network, by default, as within reach', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
    expect(await outOfReach('/a.pdf')).toBe(false);
  });
});
