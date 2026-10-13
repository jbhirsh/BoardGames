import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// A stand-in for pdf.js, which needs a real browser: pages of text items,
// and a text layer that draws one span per item as the real one does.
const pdf = vi.hoisted(() => ({
  pages: [] as string[][],
  fail: false,
  failPage: 0,
  destroyed: 0,
  options: null as unknown,
  workers: [] as unknown[],
  renders: 0,
  // The pages asked to render, in order, and one whose render fails.
  rendered: [] as number[],
  failRender: 0,
  // A page that takes until the test says so to load.
  slowPage: 0,
  slowUntil: Promise.resolve(),
  // Each page's height at a width of 100 (130 if not given), and a render
  // that finishes only when the test says so.
  heights: [] as number[],
  paint: null as Promise<void> | null,
  // Whether pages start away from the screen, as all but the first few do.
  away: false,
  // Renders that each finish only when the test steps them, in turn.
  stepwise: false,
  steps: [] as (() => void)[],
  // A page whose text comes only when the test says so.
  slowText: 0,
  textUntil: Promise.resolve(),
  // What was asked of the pages, in order: "render 2", "text 2".
  calls: [] as string[],
  // The pages drawn, by rulebook: "/rules/y.pdf 2".
  drawn: [] as string[],
  // A rulebook whose drawings never finish, and one whose next opening fails.
  hangFrom: '',
  failNext: '',
  // The rulebooks opened, in order, and one that opens only when the test says so.
  opened: [] as string[],
  slowDoc: '',
  docUntil: Promise.resolve(),
}));

vi.mock('pdfjs-dist', () => {
  const page = (n: number, strs: string[], url: string) => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: (pdf.heights[n - 1] ?? 130) * scale, scale }),
    render: () => {
      pdf.calls.push(`render ${n}`);
      pdf.drawn.push(`${url} ${n}`);
      pdf.renders++;
      pdf.rendered.push(n);
      if (n === pdf.failRender) return { promise: Promise.reject(new Error('render failed')), cancel: () => {} };
      // A cancelled render rejects, as pdf.js's does.
      let cancel = () => {};
      const cancelled = new Promise<never>((_, reject) => { cancel = () => reject(new Error('cancelled')); });
      const step = url === pdf.hangFrom
        ? new Promise<void>(() => {})
        : pdf.stepwise ? new Promise<void>((resolve) => pdf.steps.push(resolve)) : null;
      return { promise: Promise.race([step ?? pdf.paint ?? Promise.resolve(), cancelled]), cancel };
    },
    getTextContent: async () => {
      pdf.calls.push(`text ${n}`);
      if (n === pdf.slowText) await pdf.textUntil;
      if (n === pdf.failPage) throw new Error('page failed');
      return { items: strs.map((str) => ({ str, hasEOL: true })), styles: {} };
    },
  });
  class PDFWorker {
    constructor(options: unknown) {
      pdf.workers.push(options);
    }
  }
  class TextLayer {
    #items: { str: string }[];
    #container: HTMLElement;
    textDivs: HTMLElement[] = [];
    constructor({ textContentSource, container }: { textContentSource: { items: { str: string }[] }; container: HTMLElement }) {
      this.#items = textContentSource.items;
      this.#container = container;
    }
    async render() {
      for (const item of this.#items) {
        const span = document.createElement('span');
        span.textContent = item.str;
        this.textDivs.push(span);
        this.#container.append(span);
      }
    }
    cancel() {}
  }
  return {
    PDFWorker,
    TextLayer,
    getDocument: (options: unknown) => {
      pdf.options = options;
      pdf.opened.push((options as { url: string }).url);
      const { url } = options as { url: string };
      const failing = url === pdf.failNext;
      if (failing) pdf.failNext = '';
      return {
        promise: pdf.fail
          ? Promise.reject(new Error('bad pdf'))
          : (url === pdf.slowDoc ? pdf.docUntil : Promise.resolve()).then(() => {
            if (failing) throw new Error('network gave out');
            return {
              numPages: pdf.pages.length,
              getPage: async (n: number) => {
                if (n === pdf.slowPage) await pdf.slowUntil;
                return page(n, pdf.pages[n - 1], url);
              },
              cleanup: async () => {},
            };
          }),
        destroy: async () => { pdf.destroyed++; },
      };
    },
  };
});

import PdfReader from '../components/PdfReader';
import { WARM_TURN_MS } from '../pdfjs/documents';

// The worker's port: one for the whole module, as in the app.
const ports: EventTarget[] = [];
// Each page's visibility callback, so a test can scroll a page away.
const observers: ((e: { isIntersecting: boolean }[]) => void)[] = [];
// The column's size callback, so a test can turn the phone.
let resize: (width: number) => void = () => {};

beforeEach(() => {
  pdf.pages = [];
  pdf.fail = false;
  pdf.failPage = 0;
  pdf.destroyed = 0;
  pdf.renders = 0;
  pdf.rendered = [];
  pdf.failRender = 0;
  pdf.slowPage = 0;
  pdf.heights = [];
  pdf.paint = null;
  pdf.away = false;
  pdf.stepwise = false;
  pdf.steps = [];
  pdf.slowText = 0;
  pdf.opened = [];
  pdf.calls = [];
  pdf.drawn = [];
  pdf.hangFrom = '';
  pdf.failNext = '';
  pdf.slowDoc = '';
  observers.length = 0;
  vi.stubGlobal('Worker', class extends EventTarget {
    constructor() {
      super();
      ports.push(this);
    }
  });
  // Every page starts on screen, and the column is 300px wide.
  vi.stubGlobal('IntersectionObserver', class {
    cb: (e: { isIntersecting: boolean }[]) => void;
    constructor(cb: (e: { isIntersecting: boolean }[]) => void) { this.cb = cb; }
    observe() {
      observers.push(this.cb);
      this.cb([{ isIntersecting: !pdf.away }]);
    }
    disconnect() {}
  });
  vi.stubGlobal('ResizeObserver', class {
    cb: (e: { contentRect: { width: number } }[]) => void;
    constructor(cb: (e: { contentRect: { width: number } }[]) => void) { this.cb = cb; }
    observe() {
      resize = (width) => this.cb([{ contentRect: { width } }]);
      resize(300);
    }
    disconnect() {}
  });
});

afterEach(() => vi.unstubAllGlobals());

async function open(pages: string[][]) {
  pdf.pages = pages;
  const view = render(<PdfReader src="/rules/x.pdf" title="X rules" />);
  await screen.findByText(pages.flat()[0] ?? '\u0000', {}, { timeout: 1000 }).catch(() => {});
  await act(async () => {});
  return view;
}

async function search(text: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search the rulebook' }), { target: { value: text } });
  fireEvent.submit(screen.getByRole('search'));
  await act(async () => {});
}

/** Lets every promise in flight settle, the reader's queue included. */
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

const marks = () => [...document.querySelectorAll('mark.pdf-hit')].map((m) => m.textContent);
const currentMark = () => document.querySelector('mark.pdf-hit--current')?.textContent;

describe('PdfReader', () => {
  it('loads the PDF on demand and draws every page with its text', async () => {
    await open([['Set up the board'], ['Take turns']]);
    expect(pdf.options).toMatchObject({
      url: '/rules/x.pdf',
      wasmUrl: '/pdfjs/wasm/',
      standardFontDataUrl: '/pdfjs/standard_fonts/',
      disableAutoFetch: true,
      disableStream: true,
    });
    expect(screen.getByRole('region', { name: 'X rules' })).toBeInTheDocument();
    expect(screen.getByText('Set up the board')).toBeInTheDocument();
    expect(screen.getByText('Take turns')).toBeInTheDocument();
    expect(document.querySelectorAll('.pdf-page')).toHaveLength(2);
  });

  it('says so while the PDF loads', () => {
    pdf.pages = [['x']];
    render(<PdfReader src="/rules/x.pdf" title="X rules" />);
    expect(screen.getByText('Loading the rulebook…')).toBeInTheDocument();
  });

  it('says so when the PDF cannot be shown, with no search for a rulebook that isn\'t there', async () => {
    pdf.fail = true;
    render(<PdfReader src="/rules/x.pdf" title="X rules" />);
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(await screen.findByText(/couldn’t be shown here/)).toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: 'Search the rulebook' })).not.toBeInTheDocument();
  });

  it('says what the page gives it instead, when given a note, or nothing for a null one', async () => {
    pdf.fail = true;
    const onFail = vi.fn();
    const { rerender } = render(<PdfReader src="/rules/x.pdf" title="X rules" onFail={onFail} failNote={null} />);
    await vi.waitFor(() => expect(onFail).toHaveBeenCalledWith('/rules/x.pdf'));
    expect(screen.queryByText(/couldn’t be shown here/)).not.toBeInTheDocument();
    expect(screen.queryByText('Loading the rulebook…')).not.toBeInTheDocument();
    rerender(<PdfReader src="/rules/x.pdf" title="X rules" onFail={onFail} failNote={<p>Not saved here.</p>} />);
    expect(screen.getByText('Not saved here.')).toBeInTheDocument();
    expect(screen.queryByText(/couldn’t be shown here/)).not.toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });

  it('finds matches across pages, marks them and steps through them', async () => {
    await open([['An outbreak happens', 'then another outbreak'], ['Outbreak marker']]);
    await search('outbreak');
    expect(screen.getByRole('status')).toHaveTextContent('1 of 3 · page 1');
    expect(marks()).toEqual(['outbreak', 'outbreak', 'Outbreak']);
    expect(currentMark()).toBe('outbreak');
    // The mark wraps only the match; the rest of the item's text stays put.
    expect(document.querySelector('.textLayer span')?.textContent).toBe('An outbreak happens');

    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByRole('status')).toHaveTextContent('2 of 3 · page 1');
    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByRole('status')).toHaveTextContent('3 of 3 · page 2');
    expect(currentMark()).toBe('Outbreak');
    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByRole('status')).toHaveTextContent('1 of 3 · page 1');
    fireEvent.click(screen.getByRole('button', { name: 'Previous match' }));
    expect(screen.getByRole('status')).toHaveTextContent('3 of 3 · page 2');
  });

  it('marks a phrase split across text items in each of them', async () => {
    await open([['Place a research', 'station in Atlanta']]);
    await search('research station');
    expect(screen.getByRole('status')).toHaveTextContent('1 of 1 · page 1');
    expect(marks()).toEqual(['research', 'station']);
    expect(screen.queryByRole('button', { name: 'Next match' })).not.toBeInTheDocument();
  });

  it('clears the old marks on a new search and says when nothing matches', async () => {
    await open([['Draw two cards']]);
    await search('draw');
    expect(marks()).toEqual(['Draw']);
    await search('epidemic');
    expect(screen.getByRole('status')).toHaveTextContent('No matches for “epidemic”.');
    expect(marks()).toEqual([]);
    expect(screen.getByText('Draw two cards')).toBeInTheDocument();
  });

  it('ignores a blank search', async () => {
    await open([['Draw two cards']]);
    await search('   ');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('says a scanned rulebook has no text to search', async () => {
    await open([[], []]);
    await search('werewolf');
    expect(screen.getByRole('status')).toHaveTextContent(/scanned image/);
  });

  it('stops loading when it goes away', async () => {
    const { unmount } = await open([['x']]);
    unmount();
    expect(pdf.destroyed).toBe(1);
  });

  it('opens the next rulebook on the same worker, which closing one leaves running', async () => {
    const { rerender } = await open([['First book']]);
    pdf.pages = [['Second book']];
    rerender(<PdfReader key="next" src="/rules/y.pdf" title="Y rules" />);
    expect(await screen.findByText('Second book')).toBeInTheDocument();
    expect(pdf.destroyed).toBe(1);
    // One worker, made once from one port, handed to every document.
    expect(pdf.workers).toHaveLength(1);
    expect(ports).toHaveLength(1);
    expect((pdf.options as { worker: unknown }).worker).toBeInstanceOf(Object);
  });

  it('gives a page image back once the page is far from the screen', async () => {
    await open([['Only page']]);
    const canvas = document.querySelector('canvas')!;
    expect(pdf.renders).toBe(1);
    act(() => observers[0]([{ isIntersecting: false }]));
    expect(canvas.width).toBe(0);
    // Its text stays, for search and selection.
    expect(screen.getByText('Only page')).toBeInTheDocument();
    act(() => observers[0]([{ isIntersecting: true }]));
    await act(async () => {});
    expect(pdf.renders).toBe(2);
  });

  it('draws the pages again for a new pixel ratio, as when the browser is zoomed', async () => {
    const listeners: (() => void)[] = [];
    const queries: string[] = [];
    vi.stubGlobal('matchMedia', (query: string) => {
      queries.push(query);
      return { matches: false, addEventListener: (_: string, f: () => void) => listeners.push(f), removeEventListener: () => {} };
    });
    vi.stubGlobal('devicePixelRatio', 1);
    await open([['Only page']]);
    const canvas = document.querySelector('canvas')!;
    expect(canvas.width).toBe(300);
    expect(queries).toContain('(resolution: 1dppx)');
    vi.stubGlobal('devicePixelRatio', 1.5);
    await act(async () => listeners.at(-1)!());
    expect(canvas.width).toBe(450);
    // And it listens for the next change from there.
    expect(queries).toContain('(resolution: 1.5dppx)');
  });

  it('searches past a page that will not load', async () => {
    pdf.failPage = 1;
    await open([['Broken page'], ['Draw a card']]);
    await search('draw');
    expect(screen.getByRole('status')).toHaveTextContent('1 of 1 · page 2');
  });

  it('draws one page at a time: the most on screen first, then the nearest, each with its text before the next', async () => {
    // jsdom's screen is 768px tall. Page 3 shows 400px of itself, 2 shows
    // 300, 4 shows 68; 1 is 100px above the screen, 5 is 332px below it.
    const boxes: Record<string, [number, number]> = { 1: [-900, -100], 2: [-100, 300], 3: [300, 700], 4: [700, 1100], 5: [1100, 1500] };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const [top, bottom] = boxes[(this as HTMLElement).dataset.page ?? ''] ?? [0, 0];
      return { top, bottom, height: bottom - top } as DOMRect;
    });
    pdf.stepwise = true;
    pdf.pages = [['One'], ['Two'], ['Three'], ['Four'], ['Five']];
    render(<PdfReader src="/rules/x.pdf" title="X rules" />);
    await screen.findAllByRole('group');
    await flush();
    expect(pdf.rendered).toEqual([3]);
    // A page's text is laid over its image once that is drawn.
    expect(screen.queryByText('Three')).not.toBeInTheDocument();
    for (const [i, next] of [2, 4, 1, 5].entries()) {
      await act(async () => pdf.steps[i]());
      await flush();
      expect(pdf.rendered.at(-1)).toBe(next);
      // Never more than one at a time.
      expect(pdf.rendered).toHaveLength(i + 2);
    }
    expect(screen.getByText('Three')).toBeInTheDocument();
    expect(screen.queryByText('Five')).not.toBeInTheDocument();
    // Each page's text is read before the next page is drawn.
    expect(pdf.calls.slice(0, 8)).toEqual(['render 3', 'text 3', 'render 2', 'text 2', 'render 4', 'text 4', 'render 1', 'text 1']);
    await act(async () => pdf.steps[4]());
    await flush();
    expect(screen.getByText('Five')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('starts drawing the next page only once the last one\'s text is read', async () => {
    let text = () => {};
    pdf.slowText = 1;
    pdf.textUntil = new Promise<void>((resolve) => { text = resolve; });
    pdf.stepwise = true;
    pdf.pages = [['One'], ['Two']];
    render(<PdfReader src="/rules/x.pdf" title="X rules" />);
    await screen.findAllByRole('group');
    await flush();
    await act(async () => pdf.steps[0]());
    await flush();
    expect(pdf.rendered).toEqual([1]);
    await act(async () => text());
    await flush();
    expect(pdf.rendered).toEqual([1, 2]);
  });

  it('gives a page\'s turn back at once when it goes away while still loading', async () => {
    pdf.slowPage = 2;
    pdf.slowUntil = new Promise<void>(() => {});
    pdf.away = true;
    pdf.pages = [['One'], ['Two']];
    render(<PdfReader src="/rules/x.pdf" title="X rules" />);
    await screen.findAllByRole('group');
    await flush();
    act(() => observers[1]([{ isIntersecting: true }]));
    await flush();
    act(() => observers[0]([{ isIntersecting: true }]));
    await flush();
    // Page 2 never loads, so page 1 waits for it.
    expect(pdf.rendered).toEqual([]);
    act(() => observers[1]([{ isIntersecting: false }]));
    await flush();
    expect(pdf.rendered).toEqual([1]);
  });

  it('draws a search\'s match at once, beside a page already being drawn', async () => {
    pdf.stepwise = true;
    pdf.away = true;
    pdf.pages = [['One'], ['Two'], ['Draw three cards']];
    render(<PdfReader src="/rules/x.pdf" title="X rules" />);
    await screen.findAllByRole('group');
    await flush();
    act(() => observers[0]([{ isIntersecting: true }]));
    await flush();
    expect(pdf.rendered).toEqual([1]);
    act(() => observers[1]([{ isIntersecting: true }]));
    await search('cards');
    await flush();
    // Page 2 waits its turn; page 3, holding the match, doesn't.
    expect(pdf.rendered).toEqual([1, 3]);
  });

  describe('getting a cited rulebook ready ahead of a tap', () => {
    const Y = { src: '/rules/y.pdf', page: 2 };
    // A fast connection that isn't mobile data, where a warm fetches the cited page's parts.
    beforeEach(() => {
      Object.defineProperty(navigator, 'connection', { value: { effectiveType: '4g' }, configurable: true });
      vi.stubGlobal('fetch', vi.fn(async () => new Response(null)));
    });
    afterEach(() => {
      delete (navigator as { connection?: unknown }).connection;
    });

    it('opens it as the answer lands, draws the cited page out of sight, and the reader for it uses that', async () => {
      pdf.pages = [['One'], ['Two']];
      const { rerender, unmount } = render(<PdfReader src="/rules/x.pdf" title="X rules" />);
      await screen.findByText('One');
      await flush();
      const drawn = pdf.renders;
      rerender(<PdfReader src="/rules/x.pdf" title="X rules" warm={[Y]} />);
      await flush();
      expect(pdf.opened).toEqual(['/rules/x.pdf', '/rules/y.pdf']);
      expect(pdf.rendered.slice(drawn)).toEqual([2]);
      expect(pdf.calls.filter((c) => c === 'text 2')).toHaveLength(2);
      // The tab is changed: no second opening, and the first tab's rulebook closes.
      rerender(<PdfReader key="y" src="/rules/y.pdf" title="Y rules" warm={[Y]} />);
      expect(await screen.findByRole('region', { name: 'Y rules' })).toBeInTheDocument();
      await flush();
      expect(pdf.opened).toEqual(['/rules/x.pdf', '/rules/y.pdf']);
      // Page 2's text, read by the warming, isn't read again.
      expect(pdf.calls.filter((c) => c === 'text 2')).toHaveLength(2);
      expect(pdf.destroyed).toBe(1);
      // Leaving the rules page closes the one kept.
      unmount();
      await flush();
      expect(pdf.destroyed).toBe(2);
    });

    it('waits for its own rulebook to open first', async () => {
      let open = () => {};
      pdf.slowDoc = '/rules/x.pdf';
      pdf.docUntil = new Promise<void>((resolve) => { open = resolve; });
      pdf.pages = [['One'], ['Two']];
      render(<PdfReader src="/rules/x.pdf" title="X rules" warm={[Y]} />);
      await flush();
      expect(pdf.opened).toEqual(['/rules/x.pdf']);
      await act(async () => open());
      await flush();
      expect(pdf.opened).toEqual(['/rules/x.pdf', '/rules/y.pdf']);
    });

    it('draws nothing out of sight that hadn\'t started when the reader closes', async () => {
      pdf.stepwise = true;
      pdf.pages = [['One'], ['Two']];
      const { unmount } = render(<PdfReader src="/rules/x.pdf" title="X rules" warm={[Y]} />);
      await screen.findAllByRole('group');
      await flush();
      // Pages 1 and 2 are on screen, the first being drawn; y is open, its
      // drawing waiting its turn.
      expect(pdf.opened).toEqual(['/rules/x.pdf', '/rules/y.pdf']);
      unmount();
      await flush();
      expect(pdf.drawn).toEqual(['/rules/x.pdf 1']);
    });

    it('keeps drawing its own pages while the cited rulebook\'s network stalls', async () => {
      pdf.slowDoc = '/rules/y.pdf';
      pdf.docUntil = new Promise<void>(() => {});
      pdf.pages = [['One'], ['Two'], ['Three']];
      render(<PdfReader src="/rules/x.pdf" title="X rules" warm={[Y]} />);
      await screen.findByText('Three');
      await flush();
      expect(pdf.opened).toEqual(['/rules/x.pdf', '/rules/y.pdf']);
      expect(pdf.drawn).toEqual(['/rules/x.pdf 1', '/rules/x.pdf 2', '/rules/x.pdf 3']);
    });

    it('gives its own pages their turn back when the drawing out of sight doesn\'t finish', async () => {
      pdf.hangFrom = '/rules/y.pdf';
      pdf.away = true;
      pdf.pages = [['One'], ['Two']];
      render(<PdfReader src="/rules/x.pdf" title="X rules" warm={[Y]} />);
      await screen.findAllByRole('group');
      await flush();
      // Page 2 comes near, off screen: after the warm, which never finishes.
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        return ((this as HTMLElement).dataset.page === '2' ? { top: 900, bottom: 1000 } : { top: -2000, bottom: -1500 }) as DOMRect;
      });
      act(() => observers[1]([{ isIntersecting: true }]));
      await flush();
      expect(pdf.drawn).toEqual(['/rules/y.pdf 2']);
      await act(() => new Promise((resolve) => setTimeout(resolve, WARM_TURN_MS)));
      await flush();
      expect(pdf.drawn).toEqual(['/rules/y.pdf 2', '/rules/x.pdf 2']);
      vi.restoreAllMocks();
    });

    it('opens a kept rulebook afresh, once, when it fails to load after all', async () => {
      let open = () => {};
      pdf.slowDoc = '/rules/y.pdf';
      pdf.docUntil = new Promise<void>((resolve) => { open = resolve; });
      pdf.failNext = '/rules/y.pdf';
      pdf.pages = [['One'], ['Two']];
      const { rerender } = render(<PdfReader src="/rules/x.pdf" title="X rules" warm={[Y]} />);
      await screen.findByText('One');
      await flush();
      // The tab is changed while y is still opening, and y's opening fails.
      pdf.slowDoc = '';
      rerender(<PdfReader key="y" src="/rules/y.pdf" title="Y rules" warm={[Y]} />);
      await act(async () => open());
      await flush();
      expect(pdf.opened).toEqual(['/rules/x.pdf', '/rules/y.pdf', '/rules/y.pdf']);
      expect(await screen.findByText('Two')).toBeInTheDocument();
      expect(screen.queryByText(/couldn’t be shown here/)).not.toBeInTheDocument();
    });

    it('gets nothing ready offline', async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      pdf.pages = [['One'], ['Two']];
      render(<PdfReader src="/rules/x.pdf" title="X rules" warm={[Y]} />);
      await screen.findByText('One');
      await flush();
      expect(pdf.opened).toEqual(['/rules/x.pdf']);
      vi.restoreAllMocks();
    });

    it('leaves its own rulebook to itself', async () => {
      pdf.pages = [['One'], ['Two']];
      render(<PdfReader src="/rules/x.pdf" title="X rules" warm={[{ src: '/rules/x.pdf', page: 2 }]} />);
      await screen.findByText('One');
      await flush();
      expect(pdf.opened).toEqual(['/rules/x.pdf']);
    });

    it('waits for the pages on screen, and goes before those off it', async () => {
      pdf.stepwise = true;
      pdf.away = true;
      pdf.pages = [['One'], ['Two']];
      const { rerender } = render(<PdfReader src="/rules/x.pdf" title="X rules" />);
      await screen.findAllByRole('group');
      await flush();
      // Page 1 is on screen and being drawn; page 2 comes near, off screen.
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        return ((this as HTMLElement).dataset.page === '2' ? { top: 900, bottom: 1000 } : { top: 0, bottom: 500 }) as DOMRect;
      });
      act(() => observers[0]([{ isIntersecting: true }]));
      await flush();
      act(() => observers[1]([{ isIntersecting: true }]));
      rerender(<PdfReader src="/rules/x.pdf" title="X rules" warm={[Y]} />);
      await flush();
      // Opened at once, outside the queue; drawn only in its turn.
      expect(pdf.opened).toEqual(['/rules/x.pdf', '/rules/y.pdf']);
      expect(pdf.drawn).toEqual(['/rules/x.pdf 1']);
      await act(async () => pdf.steps[0]());
      await flush();
      // The warming draws y's page 2; x's page 2, off screen, waits for it.
      expect(pdf.drawn).toEqual(['/rules/x.pdf 1', '/rules/y.pdf 2']);
      await act(async () => pdf.steps[1]());
      await flush();
      expect(pdf.drawn).toEqual(['/rules/x.pdf 1', '/rules/y.pdf 2', '/rules/x.pdf 2']);
      vi.restoreAllMocks();
    });
  });

  describe('jumping to a cited page', () => {
    const scrolled: { page: string | undefined; options: unknown; above?: string }[] = [];
    const page = (n: number) => screen.getByRole('group', { name: new RegExp(`^Page ${n} of`) });
    const ringed = () => [...document.querySelectorAll('.pdf-page--cited')].map((el) => (el as HTMLElement).dataset.page);
    // Jumps a reader has made are remembered for the session, so each test's keys are its own.
    let n = 0;
    const key = () => `test-${++n}`;
    // Where a page's top is on screen: 0, where a jump puts it, unless a test moves it.
    let top: (page: string | undefined) => number = () => 0;

    beforeEach(() => {
      scrolled.length = 0;
      top = () => 0;
      Element.prototype.scrollIntoView = function (this: Element, options?: unknown) {
        const above = document.querySelector<HTMLElement>('[data-page="2"]')?.style.aspectRatio;
        scrolled.push({ page: (this as HTMLElement).dataset.page, options, above });
      };
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        return { top: top((this as HTMLElement).dataset.page), bottom: 0, height: 0 } as DOMRect;
      });
    });
    afterEach(() => {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    async function openAt(pages: string[][], jump: { page: number; key: string; place?: string; quote?: string }) {
      pdf.pages = pages;
      const view = render(<PdfReader src="/rules/x.pdf" title="X rules" jump={jump} />);
      await screen.findAllByRole('group');
      await act(async () => {});
      return view;
    }
    const jumpTo = (view: { rerender: (ui: React.ReactElement) => void }, jump: { page: number; key: string; quote?: string }) =>
      act(async () => view.rerender(<PdfReader src="/rules/x.pdf" title="X rules" jump={jump} />));

    it('names each page with the count, so focus on one says where it is', async () => {
      await open([['One'], ['Two']]);
      expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Page 1 of 2', 'Page 2 of 2']);
      expect(page(1)).toHaveAttribute('tabindex', '-1');
    });

    it('scrolls to the page, puts focus on it without a scroll of its own, and rings it', async () => {
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');
      await openAt([['One'], ['Two'], ['Three']], { page: 2, key: key() });
      expect(scrolled).toMatchObject([{ page: '2', options: { block: 'start', behavior: 'smooth' } }]);
      expect(page(2)).toHaveFocus();
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(ringed()).toEqual(['2']);
    });

    it('reads the heights of the pages above before it scrolls, so none moves the page', async () => {
      pdf.away = true;
      pdf.heights = [130, 50, 260];
      await openAt([['One'], ['Two'], ['Three']], { page: 3, key: key() });
      // Page 2 was never drawn, yet had its own height when the scroll began.
      expect(scrolled).toMatchObject([{ page: '3', above: '1 / 0.5' }]);
      expect(pdf.renders).toBe(1);
    });

    it('rings the page only once its image is drawn', async () => {
      let paint = () => {};
      pdf.paint = new Promise<void>((resolve) => { paint = resolve; });
      await openAt([['One'], ['Two']], { page: 2, key: key() });
      expect(scrolled).toHaveLength(1);
      expect(ringed()).toEqual([]);
      await act(async () => paint());
      expect(ringed()).toEqual(['2']);
    });

    it('draws the cited page first, and the pages on screen only once it is drawn', async () => {
      let paint = () => {};
      pdf.paint = new Promise<void>((resolve) => { paint = resolve; });
      await openAt([['One'], ['Two'], ['Three']], { page: 3, key: key() });
      // Every page is on screen, yet only the cited one is drawn while the
      // jump is on its way, and the others' text waits too.
      expect(pdf.rendered).toEqual([3]);
      expect(screen.queryByText('One')).not.toBeInTheDocument();
      expect(ringed()).toEqual([]);
      await act(async () => paint());
      expect(ringed()).toEqual(['3']);
      expect(pdf.rendered).toEqual([3, 1, 2]);
      expect(screen.getByText('One')).toBeInTheDocument();
    });

    it('starts drawing the cited page while the heights above it are still being read', async () => {
      let read = () => {};
      pdf.slowPage = 2;
      pdf.slowUntil = new Promise<void>((resolve) => { read = resolve; });
      pdf.pages = [['One'], ['Two'], ['Three']];
      render(<PdfReader src="/rules/x.pdf" title="X rules" jump={{ page: 3, key: key() }} />);
      await screen.findAllByRole('group');
      await act(async () => {});
      expect(pdf.rendered).toEqual([3]);
      expect(scrolled).toEqual([]);
      await act(async () => read());
      expect(scrolled).toMatchObject([{ page: '3' }]);
      expect(ringed()).toEqual(['3']);
    });

    it('rings a cited page redrawn at a new width once the new drawing is done', async () => {
      let paint = () => {};
      pdf.paint = new Promise<void>((resolve) => { paint = resolve; });
      await openAt([['One'], ['Two']], { page: 2, key: key() });
      // Turned mid-drawing: that drawing is cancelled and another started.
      act(() => resize(200));
      await act(async () => {});
      expect(pdf.rendered).toEqual([2, 2]);
      expect(ringed()).toEqual([]);
      await act(async () => paint());
      expect(ringed()).toEqual(['2']);
      expect(pdf.rendered).toEqual([2, 2, 1]);
    });

    it('rings a page that failed to draw once a later drawing works', async () => {
      pdf.failRender = 2;
      const view = await openAt([['One'], ['Two']], { page: 2, key: key() });
      expect(ringed()).toEqual([]);
      pdf.failRender = 0;
      act(() => resize(200));
      await act(async () => {});
      await jumpTo(view, { page: 2, key: key() });
      expect(ringed()).toEqual(['2']);
    });

    it('keeps a page drawn as it was while a jump passes it, and starts none it passes', async () => {
      pdf.away = true;
      pdf.pages = [['One'], ['Two'], ['Three']];
      const view = render(<PdfReader src="/rules/x.pdf" title="X rules" />);
      await screen.findAllByRole('group');
      await act(async () => {});
      act(() => observers[0]([{ isIntersecting: true }]));
      await act(async () => {});
      expect(pdf.rendered).toEqual([1]);
      let paint = () => {};
      pdf.paint = new Promise<void>((resolve) => { paint = resolve; });
      await jumpTo(view, { page: 3, key: key() });
      const [first, second] = document.querySelectorAll('canvas');
      act(() => {
        observers[0]([{ isIntersecting: false }]);
        observers[1]([{ isIntersecting: true }]);
      });
      await act(async () => {});
      expect(first.width).toBeGreaterThan(0);
      expect(pdf.rendered).toEqual([1, 3]);
      // Over: the page left behind gives its image back, the one now near is drawn.
      await act(async () => paint());
      expect(first.width).toBe(0);
      expect(second.width).toBeGreaterThan(0);
      expect(pdf.rendered).toEqual([1, 3, 2]);
    });

    it('draws a page waiting its turn at once when a citation asks for it', async () => {
      pdf.stepwise = true;
      pdf.away = true;
      pdf.pages = [['One'], ['Two']];
      const view = render(<PdfReader src="/rules/x.pdf" title="X rules" />);
      await screen.findAllByRole('group');
      await flush();
      act(() => observers[0]([{ isIntersecting: true }]));
      await flush();
      act(() => observers[1]([{ isIntersecting: true }]));
      await flush();
      expect(pdf.rendered).toEqual([1]);
      await jumpTo(view, { page: 2, key: key() });
      await flush();
      expect(pdf.rendered).toEqual([1, 2]);
    });

    it('says where a jump went once, when someone takes the scroll over before the page is drawn', async () => {
      let paint = () => {};
      pdf.paint = new Promise<void>((resolve) => { paint = resolve; });
      top = (p) => (p === '2' ? 400 : 0);
      await openAt([['One'], ['Two']], { page: 2, key: key() });
      await act(async () => { window.dispatchEvent(new Event('touchstart')); });
      const said = document.querySelector('[aria-live="polite"]')!;
      await vi.waitFor(() => expect(said).toHaveTextContent(/^Page 2$/));
      await act(async () => paint());
      // Not emptied to be said again.
      expect(said).toHaveTextContent(/^Page 2$/);
    });

    it('lets the other pages draw once someone takes the scroll over', async () => {
      pdf.paint = new Promise<void>(() => {});
      top = (p) => (p === '2' ? 400 : 0);
      await openAt([['One'], ['Two']], { page: 2, key: key() });
      expect(pdf.rendered).toEqual([2]);
      await act(async () => { window.dispatchEvent(new Event('touchstart')); });
      expect(pdf.rendered).toEqual([2, 1]);
      expect(ringed()).toEqual([]);
    });

    it('lets the other pages draw when the cited page fails to, and rings nothing', async () => {
      pdf.failRender = 2;
      await openAt([['One'], ['Two']], { page: 2, key: key() });
      expect(scrolled).toHaveLength(1);
      expect(pdf.rendered).toEqual([2, 1]);
      expect(ringed()).toEqual([]);
    });

    it('waits for the scroll to end, then puts the page right if something above moved it', async () => {
      top = (p) => (p === '2' ? 400 : 0);
      await openAt([['One'], ['Two']], { page: 2, key: key() });
      expect(scrolled).toHaveLength(1);
      expect(ringed()).toEqual([]);
      await act(async () => { window.dispatchEvent(new Event('scrollend')); });
      expect(scrolled).toMatchObject([{ page: '2' }, { page: '2', options: { block: 'start', behavior: 'instant' } }]);
      expect(ringed()).toEqual(['2']);
    });

    it('stops waiting for a scroll that never says it ended', async () => {
      vi.useFakeTimers();
      top = (p) => (p === '2' ? 400 : 0);
      pdf.pages = [['One'], ['Two']];
      render(<PdfReader src="/rules/x.pdf" title="X rules" jump={{ page: 2, key: key() }} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
      expect(scrolled).toHaveLength(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(1900); });
      expect(scrolled).toHaveLength(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      expect(scrolled).toHaveLength(2);
      expect(ringed()).toEqual(['2']);
    });

    it('leaves the page where someone who took the scroll over put it', async () => {
      top = (p) => (p === '2' ? 400 : 0);
      await openAt([['One'], ['Two']], { page: 2, key: key() });
      await act(async () => { window.dispatchEvent(new Event('touchstart')); });
      await act(async () => { window.dispatchEvent(new Event('scrollend')); });
      expect(scrolled).toHaveLength(1);
      expect(ringed()).toEqual(['2']);
    });

    it('counts a page that sits at its scroll margin, give or take a pixel, as there already', async () => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({ scrollMarginTop: '130px' } as CSSStyleDeclaration);
      top = (p) => (p === '2' ? 131 : 0);
      await openAt([['One'], ['Two']], { page: 2, key: key() });
      // No wait for a scroll that has nowhere to go, and nothing to put right.
      expect(scrolled).toHaveLength(1);
      expect(ringed()).toEqual(['2']);
    });

    it('waits for a page two pixels off its scroll margin', async () => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({ scrollMarginTop: '130px' } as CSSStyleDeclaration);
      top = (p) => (p === '2' ? 132 : 0);
      await openAt([['One'], ['Two']], { page: 2, key: key() });
      expect(ringed()).toEqual([]);
      await act(async () => { window.dispatchEvent(new Event('scrollend')); });
      expect(scrolled).toHaveLength(2);
      expect(ringed()).toEqual(['2']);
    });

    it('scrolls at once for someone who asked for less motion, and waits for nothing', async () => {
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)', addEventListener: () => {}, removeEventListener: () => {} }));
      top = (p) => (p === '2' ? 400 : 0);
      await openAt([['One'], ['Two']], { page: 2, key: key() });
      expect(scrolled).toMatchObject([
        { page: '2', options: { block: 'start', behavior: 'instant' } },
        { page: '2', options: { block: 'start', behavior: 'instant' } },
      ]);
      expect(ringed()).toEqual(['2']);
    });

    it('scrolls smoothly when motion is fine', async () => {
      vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
      await openAt([['One'], ['Two']], { page: 2, key: key() });
      expect(scrolled).toMatchObject([{ page: '2', options: { block: 'start', behavior: 'smooth' } }]);
    });

    it('lets the ring go after a moment, for the stylesheet to fade, and keeps focus there', async () => {
      vi.useFakeTimers();
      pdf.pages = [['One'], ['Two']];
      const view = render(<PdfReader src="/rules/x.pdf" title="X rules" />);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      await jumpTo(view, { page: 2, key: key() });
      expect(ringed()).toEqual(['2']);
      await act(async () => { await vi.advanceTimersByTimeAsync(1599); });
      expect(ringed()).toEqual(['2']);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(ringed()).toEqual([]);
      expect(page(2)).toHaveFocus();
    });

    it('keeps the ring its full time on a second tap of the same page', async () => {
      vi.useFakeTimers();
      pdf.pages = [['One'], ['Two']];
      const view = render(<PdfReader src="/rules/x.pdf" title="X rules" />);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      await jumpTo(view, { page: 2, key: key() });
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      await jumpTo(view, { page: 2, key: key() });
      // The first tap's timer went with it.
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(ringed()).toEqual(['2']);
      await act(async () => { await vi.advanceTimersByTimeAsync(600); });
      expect(ringed()).toEqual([]);
    });

    it('jumps again for each new tap, and moves the ring to the page asked for', async () => {
      const first = { page: 2, key: key() };
      const view = await openAt([['One'], ['Two'], ['Three']], first);
      await jumpTo(view, { ...first });
      expect(scrolled).toHaveLength(1);
      await jumpTo(view, { page: 2, key: key() });
      expect(scrolled.map((s) => s.page)).toEqual(['2', '2']);
      await jumpTo(view, { page: 3, key: key() });
      expect(scrolled.map((s) => s.page)).toEqual(['2', '2', '3']);
      expect(ringed()).toEqual(['3']);
      expect(page(3)).toHaveFocus();
    });

    it('makes a jump once: back on the page, or reloaded, it stays where it was left', async () => {
      const jump = { page: 2, key: key() };
      const { unmount } = await openAt([['One'], ['Two']], jump);
      expect(scrolled).toHaveLength(1);
      unmount();
      await openAt([['One'], ['Two']], jump);
      expect(scrolled).toHaveLength(1);
      expect(page(2)).not.toHaveFocus();
      expect(JSON.parse(sessionStorage.getItem('pdf-reader:jumps')!)).toContain(`${jump.key} /rules/x.pdf 2`);
    });

    it('passes over a jump an earlier load of the page made, and keeps the last 50', async () => {
      const jump = { page: 2, key: key() };
      const older = Array.from({ length: 60 }, (_, i) => `old-${i} /rules/x.pdf 1`);
      sessionStorage.setItem('pdf-reader:jumps', JSON.stringify([...older, `${jump.key} /rules/x.pdf 2`]));
      const view = await openAt([['One'], ['Two']], jump);
      expect(scrolled).toEqual([]);
      await jumpTo(view, { page: 1, key: key() });
      const kept = JSON.parse(sessionStorage.getItem('pdf-reader:jumps')!) as string[];
      expect(kept).toHaveLength(50);
      expect(kept.at(-1)).toMatch(/ \/rules\/x\.pdf 1$/);
      sessionStorage.clear();
    });

    it('says where a jump went, by its rulebook\'s tab when it has one', async () => {
      const view = await openAt([['One'], ['Two']], { page: 2, key: key(), place: 'Base game' });
      const said = document.querySelector('[aria-live="polite"]')!;
      await vi.waitFor(() => expect(said).toHaveTextContent('Base game, page 2'));
      await jumpTo(view, { page: 1, key: key() });
      await vi.waitFor(() => expect(said).toHaveTextContent('Page 1'));
    });

    it('keeps the cited page drawn when it is far from the screen', async () => {
      await openAt([['One'], ['Two']], { page: 2, key: key() });
      const [first, second] = document.querySelectorAll('canvas');
      act(() => {
        observers[0]([{ isIntersecting: false }]);
        observers[1]([{ isIntersecting: false }]);
      });
      expect(first.width).toBe(0);
      expect(second.width).toBeGreaterThan(0);
    });

    it('goes to the last page like any other', async () => {
      await openAt([['One'], ['Two']], { page: 2, key: key() });
      expect(scrolled.map((s) => s.page)).toEqual(['2']);
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('says when the rulebook has no such page, again on each tap, and goes nowhere', async () => {
      const view = await openAt([['One'], ['Two']], { page: 9, key: key() });
      const status = screen.getByRole('status');
      await vi.waitFor(() => expect(status).toHaveTextContent('This rulebook has 2 pages, so it has no page 9.'));
      expect(scrolled).toEqual([]);
      // Emptied and said again, so a screen reader hears it again.
      await jumpTo(view, { page: 9, key: key() });
      expect(status).toBeEmptyDOMElement();
      await vi.waitFor(() => expect(status).toHaveTextContent('so it has no page 9.'));
      // A search says its own piece.
      await search('two');
      expect(status).toHaveTextContent('1 of 1 · page 2');
    });

    describe('marking the passage a citation points to', () => {
      const ROBBER = [['Setup is quick.'], ['If you roll a 7, nobody collects resources.', 'Then you must move the robber to another hex.']];
      const QUOTE = 'On a 7 nobody collects resources, and you move the robber';
      const PASSAGE = ['If you roll a 7, nobody collects resources.', 'Then you must move the robber to another hex.'];
      const cites = () => [...document.querySelectorAll('mark.pdf-hit--cited')].map((m) => m.textContent);
      const said = () => document.querySelector('[aria-live="polite"]')!;
      /** Puts the marks `at` pixels down the screen, 20px tall; pages stay where `top` puts them. */
      const marksAt = (at: number) => vi.mocked(Element.prototype.getBoundingClientRect).mockImplementation(function (this: Element) {
        const y = this.tagName === 'MARK' ? at : top((this as HTMLElement).dataset.page);
        return { top: y, bottom: y + 20, height: 20 } as DOMRect;
      });

      it('marks the passage the answer\'s words point to, like a match, and says where it starts', async () => {
        await openAt(ROBBER, { page: 2, key: key(), quote: QUOTE });
        // Whole sentences, so each mark is a whole item of the text layer.
        expect(cites()).toEqual(PASSAGE);
        expect(marks()).toEqual(cites());
        expect(ringed()).toEqual(['2']);
        await vi.waitFor(() => expect(said()).toHaveTextContent('Page 2. Highlighted: If you roll a 7, nobody…'));
      });

      it('marks nothing, and only rings the page, when too few of the words are there', async () => {
        await openAt(ROBBER, { page: 2, key: key(), quote: 'Trade with the bank at four to one' });
        expect(cites()).toEqual([]);
        expect(ringed()).toEqual(['2']);
        await vi.waitFor(() => expect(said()).toHaveTextContent(/^Page 2$/));
      });

      it('jumps without waiting for the page\'s text, and marks the passage, and says it, once the text comes', async () => {
        let text = () => {};
        pdf.slowText = 2;
        pdf.textUntil = new Promise<void>((resolve) => { text = resolve; });
        await openAt(ROBBER, { page: 2, key: key(), quote: QUOTE });
        expect(scrolled).toMatchObject([{ page: '2' }]);
        expect(ringed()).toEqual(['2']);
        expect(cites()).toEqual([]);
        await vi.waitFor(() => expect(said()).toHaveTextContent(/^Page 2$/));
        await act(async () => text());
        await flush();
        expect(cites()).toEqual(PASSAGE);
        // Said on its own, after the place, which has been said already.
        await vi.waitFor(() => expect(said()).toHaveTextContent(/^Highlighted: If you roll a 7, nobody…$/));
      });

      it('says the place and the passage as one when the passage is found before the place is said', async () => {
        // Frames run only when the test runs them.
        const frames = new Map<number, FrameRequestCallback>();
        let id = 0;
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++id, cb); return id; });
        vi.stubGlobal('cancelAnimationFrame', (n: number) => { frames.delete(n); });
        let text = () => {};
        pdf.slowText = 2;
        pdf.textUntil = new Promise<void>((resolve) => { text = resolve; });
        await openAt(ROBBER, { page: 2, key: key(), quote: QUOTE });
        expect(scrolled).toMatchObject([{ page: '2' }]);
        await act(async () => text());
        await flush();
        act(() => {
          for (const cb of frames.values()) cb(0);
        });
        expect(said()).toHaveTextContent(/^Page 2\. Highlighted: If you roll a 7, nobody…$/);
      });

      it('says nothing more of a passage found after someone took the scroll over, but marks it', async () => {
        let text = () => {};
        pdf.slowText = 2;
        pdf.textUntil = new Promise<void>((resolve) => { text = resolve; });
        top = (p) => (p === '2' ? 400 : 0);
        await openAt(ROBBER, { page: 2, key: key(), quote: QUOTE });
        await act(async () => { window.dispatchEvent(new Event('touchstart')); });
        await vi.waitFor(() => expect(said()).toHaveTextContent(/^Page 2$/));
        await act(async () => text());
        await flush();
        expect(cites()).toEqual(PASSAGE);
        await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
        expect(said()).toHaveTextContent(/^Page 2$/);
      });

      it('still jumps when the page\'s text won\'t load', async () => {
        pdf.failPage = 2;
        await openAt(ROBBER, { page: 2, key: key(), quote: QUOTE });
        expect(scrolled).toMatchObject([{ page: '2' }]);
        expect(ringed()).toEqual(['2']);
        expect(cites()).toEqual([]);
      });

      it('keeps the mark until a search, which marks only its own matches', async () => {
        await openAt(ROBBER, { page: 2, key: key(), quote: QUOTE });
        expect(cites()).toHaveLength(2);
        await search('setup');
        expect(cites()).toEqual([]);
        expect(marks()).toEqual(['Setup']);
        expect(screen.getByRole('status')).toHaveTextContent('1 of 1 · page 1');
      });

      it('moves to the next jump, and goes with one that has no words', async () => {
        const view = await openAt([...ROBBER, ['Roll a 7 and move the robber at once.']], { page: 2, key: key(), quote: QUOTE });
        expect(cites()).toHaveLength(2);
        await jumpTo(view, { page: 3, key: key(), quote: QUOTE });
        expect(cites()).toEqual(['Roll a 7 and move the robber at once.']);
        await jumpTo(view, { page: 3, key: key() });
        expect(cites()).toEqual([]);
      });

      it('still shows the current search match when it falls inside the passage', async () => {
        const view = await openAt(ROBBER, { page: 1, key: key() });
        await search('robber');
        await jumpTo(view, { page: 2, key: key(), quote: QUOTE });
        expect(cites()).toEqual([PASSAGE[0], 'Then you must move the ', ' to another hex.']);
        expect(marks()).toEqual([PASSAGE[0], 'Then you must move the ', 'robber', ' to another hex.']);
        expect(currentMark()).toBe('robber');
        expect(document.querySelector('mark.pdf-hit--current')!.parentElement).toHaveTextContent(PASSAGE[1]);
      });

      it('marks the passage around a search match that starts inside it and runs past it', async () => {
        const view = await openAt([['x'], ['Move the robber now.', 'Robber steals.']], { page: 1, key: key() });
        await search('now. Robber');
        await jumpTo(view, { page: 2, key: key(), quote: 'Moving the robber now' });
        expect(marks()).toEqual(['Move the robber ', 'now.', 'Robber']);
        expect(cites()).toEqual(['Move the robber ']);
      });

      it('brings a passage below the fold on screen once the jump is over', async () => {
        marksAt(2000);
        await openAt(ROBBER, { page: 2, key: key(), quote: QUOTE });
        expect(scrolled).toMatchObject([
          { page: '2', options: { block: 'start' } },
          { page: undefined, options: { block: 'center', behavior: 'smooth' } },
        ]);
      });

      it('brings up a passage under the search bar, on a page already laid out', async () => {
        vi.spyOn(window, 'getComputedStyle').mockReturnValue({ scrollMarginTop: '130px' } as CSSStyleDeclaration);
        top = () => 130;
        const view = await openAt(ROBBER, { page: 1, key: key() });
        marksAt(100);
        scrolled.length = 0;
        await jumpTo(view, { page: 2, key: key(), quote: QUOTE });
        expect(scrolled).toMatchObject([{ page: '2' }, { page: undefined, options: { block: 'center' } }]);
      });

      it('leaves a passage already on screen where it is', async () => {
        marksAt(300);
        await openAt(ROBBER, { page: 2, key: key(), quote: QUOTE });
        expect(scrolled).toMatchObject([{ page: '2' }]);
        expect(scrolled).toHaveLength(1);
      });

      it('leaves the scroll to someone who took it over', async () => {
        top = (p) => (p === '2' ? 400 : 0);
        marksAt(2000);
        await openAt(ROBBER, { page: 2, key: key(), quote: QUOTE });
        await act(async () => { window.dispatchEvent(new Event('touchstart')); });
        await act(async () => {});
        expect(cites()).toHaveLength(2);
        expect(scrolled).toHaveLength(1);
      });
    });

    it('tells the page when the rulebook can\'t be shown', async () => {
      pdf.fail = true;
      const onFail = vi.fn();
      render(<PdfReader src="/rules/x.pdf" title="X rules" onFail={onFail} />);
      await screen.findByText(/couldn’t be shown here/);
      expect(onFail).toHaveBeenCalledTimes(1);
    });
  });

  // Last: it leaves the module on a second worker.
  it('says the rulebook cannot be shown when the worker fails to start, and starts another for the next reader', async () => {
    pdf.pages = [['x']];
    render(<PdfReader src="/rules/x.pdf" title="X rules" />);
    act(() => { ports[0].dispatchEvent(new Event('error')); });
    expect(await screen.findByText(/couldn’t be shown here/)).toBeInTheDocument();
    // A reader opened afterwards (the rules page's, once the network is
    // back) doesn't inherit it, and fails only if its own worker does.
    pdf.pages = [['Second worker']];
    render(<PdfReader key="again" src="/rules/z.pdf" title="Z rules" />);
    expect(await screen.findByText('Second worker')).toBeInTheDocument();
    expect(ports).toHaveLength(2);
    expect(pdf.workers).toHaveLength(2);
    expect(screen.getAllByText(/couldn’t be shown here/)).toHaveLength(1);
    act(() => { ports[1].dispatchEvent(new Event('error')); });
    expect(await screen.findAllByText(/couldn’t be shown here/)).toHaveLength(2);
  });
});
