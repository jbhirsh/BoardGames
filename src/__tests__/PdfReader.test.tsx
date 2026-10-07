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
}));

vi.mock('pdfjs-dist', () => {
  const page = (n: number, strs: string[]) => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 130 * scale, scale }),
    render: () => {
      pdf.renders++;
      return { promise: Promise.resolve(), cancel: () => {} };
    },
    getTextContent: async () => {
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
      return {
        promise: pdf.fail
          ? Promise.reject(new Error('bad pdf'))
          : Promise.resolve({ numPages: pdf.pages.length, getPage: async (n: number) => page(n, pdf.pages[n - 1]) }),
        destroy: async () => { pdf.destroyed++; },
      };
    },
  };
});

import PdfReader from '../components/PdfReader';

// The worker's port: one for the whole module, as in the app.
const ports: EventTarget[] = [];
// Each page's visibility callback, so a test can scroll a page away.
const observers: ((e: { isIntersecting: boolean }[]) => void)[] = [];

beforeEach(() => {
  pdf.pages = [];
  pdf.fail = false;
  pdf.failPage = 0;
  pdf.destroyed = 0;
  pdf.renders = 0;
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
      this.cb([{ isIntersecting: true }]);
    }
    disconnect() {}
  });
  vi.stubGlobal('ResizeObserver', class {
    cb: (e: { contentRect: { width: number } }[]) => void;
    constructor(cb: (e: { contentRect: { width: number } }[]) => void) { this.cb = cb; }
    observe() { this.cb([{ contentRect: { width: 300 } }]); }
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

  it('says so when the PDF cannot be shown', async () => {
    pdf.fail = true;
    render(<PdfReader src="/rules/x.pdf" title="X rules" />);
    expect(await screen.findByText(/couldn’t be shown here/)).toBeInTheDocument();
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

  it('searches past a page that will not load', async () => {
    pdf.failPage = 1;
    await open([['Broken page'], ['Draw a card']]);
    await search('draw');
    expect(screen.getByRole('status')).toHaveTextContent('1 of 1 · page 2');
  });

  // Last: a broken worker stays broken for the rest of the module.
  it('says the rulebook cannot be shown when the worker fails to start', async () => {
    pdf.pages = [['x']];
    render(<PdfReader src="/rules/x.pdf" title="X rules" />);
    act(() => { ports[0].dispatchEvent(new Event('error')); });
    expect(await screen.findByText(/couldn’t be shown here/)).toBeInTheDocument();
    // A reader opened afterwards knows the worker is gone.
    render(<PdfReader key="again" src="/rules/z.pdf" title="Z rules" />);
    await act(async () => {});
    expect(screen.getAllByText(/couldn’t be shown here/)).toHaveLength(2);
  });
});
