import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A stand-in for pdf.js: documents of three pages, which say what is asked of them.
const pdf = vi.hoisted(() => ({
  opened: [] as string[],
  options: [] as unknown[],
  destroyed: [] as string[],
  cleaned: [] as string[],
  // [url, page, width drawn at]
  rendered: [] as [string, number, number][],
  texts: [] as [string, number][],
  fail: new Set<string>(),
  failText: 0,
  // Rulebooks whose drawings never finish (a network that has stalled).
  hang: new Set<string>(),
  // Whether a document's cleanup fails, as pdf.js's does while a page is drawn.
  cleanupFails: false,
}));

vi.mock('pdfjs-dist', () => ({
  PDFWorker: class {},
  getDocument: (options: { url: string }) => {
    const { url } = options;
    pdf.opened.push(url);
    pdf.options.push(options);
    const doc = {
      numPages: 3,
      getPage: async (n: number) => {
        if (n > 3) throw new Error('no such page');
        return {
          getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 130 * scale, scale }),
          render: ({ viewport }: { viewport: { width: number } }) => {
            pdf.rendered.push([url, n, viewport.width]);
            return { promise: pdf.hang.has(url) ? new Promise(() => {}) : Promise.resolve() };
          },
          getTextContent: async () => {
            pdf.texts.push([url, n]);
            if (n === pdf.failText) throw new Error('page failed');
            return { items: [{ str: `${url} page ${n}`, hasEOL: true }], styles: {} };
          },
        };
      },
      cleanup: async () => {
        if (pdf.cleanupFails) throw new Error('startCleanup: Page 2 is currently rendering.');
        pdf.cleaned.push(url);
      },
    };
    return {
      promise: pdf.fail.has(url) ? Promise.reject(new Error('bad pdf')) : Promise.resolve(doc),
      destroy: async () => {
        pdf.destroyed.push(url);
      },
    };
  },
}));

import { WARM_HEADER } from '../utils/offline';
import {
  closeKept,
  heldDocument,
  readerOpens,
  textOf,
  TIDY_MS,
  warmPage,
  warmWay,
  WARM_TURN_MS,
  type Browser,
} from '../pdfjs/documents';

/** Lets the module's promises and microtasks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Gets a page ready as the reader does: opened and loaded, then drawn in the queue's turn. */
async function warm(src: string, n: number) {
  const draw = await warmPage(src, n);
  await draw?.();
  return draw;
}

/** Says what the browser says of its connection, for the tests that warm over the network. */
function connection(value: object | undefined) {
  Object.defineProperty(navigator, 'connection', { value, configurable: true });
}

let head: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal('Worker', class extends EventTarget {});
  head = vi.fn(async () => new Response(null));
  vi.stubGlobal('fetch', head);
  // A fast connection, not mobile data: a warm fetches the cited page's parts.
  connection({ effectiveType: '4g' });
});

afterEach(() => {
  vi.useRealTimers();
  closeKept();
  pdf.opened = [];
  pdf.options = [];
  pdf.destroyed = [];
  pdf.cleaned = [];
  pdf.rendered = [];
  pdf.texts = [];
  pdf.fail.clear();
  pdf.hang.clear();
  pdf.failText = 0;
  pdf.cleanupFails = false;
  delete (navigator as { connection?: unknown }).connection;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('warmWay', () => {
  const nav = (onLine: boolean, connection?: object, controller: unknown = null): Browser => ({
    onLine,
    connection,
    serviceWorker: { controller },
  });
  /** A service worker's cache store holding `saved`. */
  const store = (...saved: string[]) =>
    ({
      match: async (src: string) => (saved.includes(src) ? new Response('%PDF') : undefined),
    }) as unknown as CacheStorage;

  it('reads a rulebook the service worker has saved, which costs no data, on any connection or none', async () => {
    expect(await warmWay('/a.pdf', nav(true, undefined, {}), store('/a.pdf'))).toBe('saved');
    expect(await warmWay('/a.pdf', nav(false, { type: 'cellular', saveData: true }, {}), store('/a.pdf'))).toBe(
      'saved',
    );
  });

  it('counts nothing as saved without a service worker in charge of the page, or a store to look in', async () => {
    expect(await warmWay('/a.pdf', nav(true), store('/a.pdf'))).toBeNull();
    expect(await warmWay('/a.pdf', nav(true, undefined, {}), undefined)).toBeNull();
    const broken = {
      match: async () => {
        throw new Error('blocked');
      },
    } as unknown as CacheStorage;
    expect(await warmWay('/a.pdf', nav(true, undefined, {}), broken)).toBeNull();
    expect(await warmWay('/a.pdf', nav(true, undefined, {}), store('/b.pdf'))).toBeNull();
  });

  it("fetches only the cited page's parts on a fast connection that isn't mobile data", async () => {
    expect(await warmWay('/a.pdf', nav(true, { effectiveType: '4g' }))).toBe('ranges');
    expect(await warmWay('/a.pdf', nav(true, { effectiveType: '4g', type: 'wifi', saveData: false }))).toBe('ranges');
  });

  it('fetches nothing on mobile data, a slower connection, for a visitor saving data, or offline', async () => {
    expect(await warmWay('/a.pdf', nav(true, { effectiveType: '4g', type: 'cellular' }))).toBeNull();
    expect(await warmWay('/a.pdf', nav(true, { effectiveType: '3g' }))).toBeNull();
    expect(await warmWay('/a.pdf', nav(true, { effectiveType: '4g', saveData: true }))).toBeNull();
    expect(await warmWay('/a.pdf', nav(false, { effectiveType: '4g' }))).toBeNull();
  });

  it("fetches nothing where the browser doesn't say what its connection is (Safari, Firefox)", async () => {
    expect(await warmWay('/a.pdf', nav(true))).toBeNull();
  });

  it('asks the browser by default', async () => {
    expect(await warmWay('/a.pdf')).toBe('ranges');
    connection(undefined);
    expect(await warmWay('/a.pdf')).toBeNull();
  });
});

describe('warmPage', () => {
  it('opens the rulebook as a warm, draws the page once out of sight, and reads its text', async () => {
    await warm('/a.pdf', 2);
    expect(pdf.opened).toEqual(['/a.pdf']);
    // On the shared worker, which fetches its decoders itself (two
    // rulebooks open at once, and the page's side of either may close
    // first), its requests marked so the service worker saves nothing.
    expect(pdf.options[0]).toMatchObject({
      useWorkerFetch: true,
      iccUrl: '/pdfjs/iccs/',
      disableAutoFetch: true,
      disableStream: true,
      httpHeaders: { [WARM_HEADER]: '1' },
    });
    // Small: what pdf.js keeps of a page doesn't depend on its size.
    expect(pdf.rendered).toEqual([['/a.pdf', 2, 64]]);
    expect(pdf.texts).toEqual([['/a.pdf', 2]]);
  });

  it('opens a rulebook the service worker has saved as any other', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: { controller: {} }, configurable: true });
    vi.stubGlobal('caches', { match: async () => new Response('%PDF') });
    try {
      connection(undefined);
      await warm('/a.pdf', 2);
    } finally {
      delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    }
    expect(pdf.options[0]).not.toHaveProperty('httpHeaders');
    expect(pdf.rendered).toEqual([['/a.pdf', 2, 64]]);
  });

  it("opens nothing when it isn't worth it", async () => {
    connection({ effectiveType: '4g', type: 'cellular' });
    expect(await warmPage('/a.pdf', 2)).toBeNull();
    expect(pdf.opened).toEqual([]);
    expect(heldDocument('/a.pdf')).toBeNull();
  });

  it('warms each page once while the rulebook is kept, on the one document', async () => {
    const [first, second] = await Promise.all([warmPage('/a.pdf', 2), warmPage('/a.pdf', 2)]);
    await Promise.all([first!(), second!()]);
    expect(await warmPage('/a.pdf', 2)).toBeNull();
    await warm('/a.pdf', 3);
    expect(pdf.opened).toEqual(['/a.pdf']);
    expect(pdf.rendered.map(([, n]) => n)).toEqual([2, 3]);
  });

  it('lets a rulebook that would not open be opened afresh', async () => {
    pdf.fail.add('/bad.pdf');
    expect(await warmPage('/bad.pdf', 1)).toBeNull();
    await settle();
    expect(heldDocument('/bad.pdf')).toBeNull();
    pdf.fail.clear();
    await warm('/bad.pdf', 1);
    expect(pdf.opened).toEqual(['/bad.pdf', '/bad.pdf']);
    expect(pdf.rendered).toEqual([['/bad.pdf', 1, 64]]);
  });

  it('tries a page again that failed to warm, and has nothing to draw for a page past the end', async () => {
    pdf.failText = 2;
    await warm('/a.pdf', 2);
    pdf.failText = 0;
    await warm('/a.pdf', 2);
    expect(pdf.texts).toEqual([
      ['/a.pdf', 2],
      ['/a.pdf', 2],
    ]);
    expect(await warmPage('/a.pdf', 9)).toBeNull();
  });

  it("gives the reader's queue its place back when the drawing doesn't finish", async () => {
    vi.useFakeTimers();
    pdf.hang.add('/a.pdf');
    const draw = (await warmPage('/a.pdf', 2))!;
    let over = false;
    void draw().then(() => {
      over = true;
    });
    await vi.advanceTimersByTimeAsync(WARM_TURN_MS - 1);
    expect(over).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(over).toBe(true);
  });

  it('gives the place back when the rulebook is closed under the drawing, pushed out or left', async () => {
    vi.useFakeTimers();
    pdf.hang.add('/a.pdf');
    pdf.hang.add('/d.pdf');
    let over = 0;
    void (await warmPage('/a.pdf', 2))!().then(() => over++);
    // Pushed out by two more.
    await warm('/b.pdf', 1);
    await warm('/c.pdf', 1);
    expect(pdf.destroyed).toEqual(['/a.pdf']);
    void (await warmPage('/d.pdf', 1))!().then(() => over++);
    closeKept();
    await vi.advanceTimersByTimeAsync(WARM_TURN_MS);
    expect(over).toBe(2);
  });
});

describe('the kept rulebooks', () => {
  it('hand a reader the warmed document with the text already read, and have it saved for offline', async () => {
    await warm('/a.pdf', 2);
    expect(head).not.toHaveBeenCalled();
    const held = heldDocument('/a.pdf')!;
    const doc = await held.promise;
    expect((await textOf(held.texts, doc, 2)).text.text).toContain('/a.pdf page 2');
    // Read once, by the warming.
    expect(pdf.texts).toEqual([['/a.pdf', 2]]);
    // Shown now: the service worker is asked for it as for any rulebook opened, once.
    expect(head).toHaveBeenCalledWith('/a.pdf', { method: 'HEAD' });
    held.release();
    heldDocument('/a.pdf')!.release();
    expect(head).toHaveBeenCalledTimes(1);
    expect(heldDocument('/b.pdf')).toBeNull();
  });

  it('ask for no saving of one read from the saved copy', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: { controller: {} }, configurable: true });
    vi.stubGlobal('caches', { match: async () => new Response('%PDF') });
    try {
      await warm('/a.pdf', 2);
    } finally {
      delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    }
    heldDocument('/a.pdf')!.release();
    expect(head).not.toHaveBeenCalled();
  });

  it('keep two, closing the least recently used', async () => {
    await warm('/a.pdf', 1);
    await warm('/b.pdf', 1);
    // Shown by a reader since: now more recently used than b.
    heldDocument('/a.pdf')!.release();
    await warm('/c.pdf', 1);
    expect(pdf.destroyed).toEqual(['/b.pdf']);
    expect(heldDocument('/b.pdf')).toBeNull();
    expect(heldDocument('/a.pdf')).not.toBeNull();
    expect(heldDocument('/c.pdf')).not.toBeNull();
  });

  it('never close one a reader is showing, and keep no more than two for it', async () => {
    await warm('/a.pdf', 1);
    const a = heldDocument('/a.pdf')!;
    await warm('/b.pdf', 1);
    await warm('/c.pdf', 1);
    // b was the one to go: a is on screen.
    expect(pdf.destroyed).toEqual(['/b.pdf']);
    const c = heldDocument('/c.pdf')!;
    // Both on screen: no room to warm another, so it isn't opened.
    expect(await warmPage('/d.pdf', 1)).toBeNull();
    expect(pdf.opened).toEqual(['/a.pdf', '/b.pdf', '/c.pdf']);
    // But a page of one kept is still warmed.
    await warm('/a.pdf', 2);
    expect(pdf.rendered.at(-1)).toEqual(['/a.pdf', 2, 64]);
    // Shown twice over: let go by one reader, twice, it is still shown by the other.
    const again = heldDocument('/a.pdf')!;
    again.release();
    again.release();
    expect(await warmPage('/e.pdf', 1)).toBeNull();
    a.release();
    await warm('/d.pdf', 1);
    expect(pdf.destroyed).toEqual(['/b.pdf', '/a.pdf']);
    expect(heldDocument('/c.pdf')).not.toBeNull();
    c.release();
  });

  it("drop their drawings once the last reader lets them go, the warm's too", async () => {
    vi.useFakeTimers();
    await warm('/a.pdf', 2);
    const first = heldDocument('/a.pdf')!;
    const second = heldDocument('/a.pdf')!;
    first.release();
    await vi.advanceTimersByTimeAsync(TIDY_MS);
    // Still shown.
    expect(pdf.cleaned).toEqual([]);
    second.release();
    await vi.advanceTimersByTimeAsync(TIDY_MS - 1);
    expect(pdf.cleaned).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(pdf.cleaned).toEqual(['/a.pdf']);
    expect(pdf.destroyed).toEqual([]);
    // Kept still, and the page can be warmed again.
    expect(await warmPage('/a.pdf', 2)).not.toBeNull();
  });

  it('leave one shown again before it is tidied as it is', async () => {
    vi.useFakeTimers();
    await warm('/a.pdf', 2);
    heldDocument('/a.pdf')!.release();
    const again = heldDocument('/a.pdf')!;
    await vi.advanceTimersByTimeAsync(TIDY_MS);
    expect(pdf.cleaned).toEqual([]);
    again.release();
  });

  it("close one that can't be tidied while a drawing runs", async () => {
    vi.useFakeTimers();
    await warm('/a.pdf', 2);
    pdf.cleanupFails = true;
    heldDocument('/a.pdf')!.release();
    await vi.advanceTimersByTimeAsync(TIDY_MS);
    expect(pdf.destroyed).toEqual(['/a.pdf']);
    expect(heldDocument('/a.pdf')).toBeNull();
  });

  it('are closed once the rules page is left, but not when its tab changes', async () => {
    await warm('/a.pdf', 1);
    const closeFirst = readerOpens();
    // A tab change: the next reader opens as the last one closes.
    closeFirst();
    const closeNext = readerOpens();
    await settle();
    expect(pdf.destroyed).toEqual([]);
    closeNext();
    await settle();
    expect(pdf.destroyed).toEqual(['/a.pdf']);
    expect(heldDocument('/a.pdf')).toBeNull();
  });
});

describe('textOf', () => {
  it('reads a page once, and again after a failure', async () => {
    await warm('/a.pdf', 1);
    const held = heldDocument('/a.pdf')!;
    const doc = await held.promise;
    pdf.failText = 3;
    await expect(textOf(held.texts, doc, 3)).rejects.toThrow('page failed');
    await settle();
    pdf.failText = 0;
    await textOf(held.texts, doc, 3);
    await textOf(held.texts, doc, 3);
    expect(pdf.texts.filter(([, n]) => n === 3)).toHaveLength(2);
  });
});
