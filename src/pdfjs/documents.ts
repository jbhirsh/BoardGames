// First, so the methods pdf.js expects are there before its code runs.
import './polyfills';
import { getDocument, PDFWorker, type PDFDocumentLoadingTask, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist';
import { pageText, type PageText, type TextRun } from '../utils/pdfSearch';
import { startWorker } from './startWorker';
import { savedCopy, type Online } from './saved';

// The rulebooks the reader opens, on one worker, and the ones it opens ahead
// of time: an answer that cites another tab's rulebook has that rulebook
// opened, and the cited page drawn once out of sight and its text read,
// while the answer is read. pdf.js keeps a page's drawing instructions and
// images, so a tap on the citation finds the page ready to draw rather than
// waiting a second or more (on a phone) for the worker to work it out.
// Only where it costs nothing (the rulebook is saved for offline already)
// or little: the cited page's parts, about a megabyte, on a fast
// connection that isn't a phone's mobile data (see warmWay).

// The decoders for JPEG 2000 and JBIG2 images, and the fonts PDFs name but
// don't embed. vite.config.ts copies them from pdfjs-dist into the build.
const ASSETS = '/pdfjs/';
// The rulebooks kept open, at most: each holds its cited page's images, and
// a phone's memory is short.
const KEEP = 2;
// How wide the out-of-sight drawing is: what is kept doesn't depend on it.
const WARM_WIDTH = 64;
// How long the out-of-sight drawing may hold the reader's queue. Past it the
// reader's own pages go on, and the drawing finishes (or never does, on a
// network that has stalled) beside them.
export const WARM_TURN_MS = 2500;
// How long after the last reader lets a kept rulebook go its drawings are
// dropped: time for that reader's cancelled drawings to stop (pdf.js gives
// them 100 ms), since a document can't be tidied while one is running.
export const TIDY_MS = 250;
// Marks a warm's requests, which the service worker answers without saving
// the file: WARM_HEADER in utils/offline.ts, written out here since the
// service worker may share no code with the app (vite.config.ts).
const WARM_HEADER = 'X-Warm';

// One worker for every rulebook the page opens, started on first use. It is
// our own entry, which installs the polyfills before pdf.js's worker code.
// Handing it to getDocument as `worker` keeps it alive when a document is
// destroyed: a reader for the next tab must not find it shutting down. One
// that failed (its file not saved, and no network to fetch it from) gives
// way to a new one for the next reader, so a rulebook that failed offline
// can load once the network is back (the rules page opens it again then).
let shared: { worker: PDFWorker; broken: boolean; port: Worker } | null = null;
export function sharedWorker() {
  if (!shared || shared.broken) {
    const port = startWorker();
    const current = { worker: new PDFWorker({ port: port as never }), broken: false, port };
    port.addEventListener('error', () => { current.broken = true; });
    shared = current;
  }
  return shared;
}

/**
 * Opens a rulebook on the shared worker. `warm` marks its requests as a warm's
 * (WARM_HEADER), which the service worker answers without saving the file.
 */
export function openDocument(src: string, warm = false): PDFDocumentLoadingTask {
  return getDocument({
    url: src,
    worker: sharedWorker().worker,
    wasmUrl: `${ASSETS}wasm/`,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    // The colour profile for CMYK images, which the worker's own fetching
    // (below) otherwise warns it hasn't got.
    iccUrl: `${ASSETS}iccs/`,
    // Fetch only the parts of the file the pages on screen need (both
    // flags: a streamed request would bring the whole file anyway).
    disableAutoFetch: true,
    disableStream: true,
    // The worker fetches the image decoders (and fonts) itself. Otherwise
    // it asks for a decoder through the page's side of whichever rulebook
    // was opened last (pdf.js keeps one for every rulebook), and once that
    // one is closed, as a tab change closes one while another is opening,
    // a page that needs the decoder waits for it for good.
    useWorkerFetch: true,
    ...(warm ? { httpHeaders: { [WARM_HEADER]: '1' } } : {}),
  });
}

type TextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>;

export interface PageTextData {
  content: TextContent;
  runs: TextRun[];
  text: PageText;
}

/** A page's text, the same items the text layer draws, so offsets line up. */
async function readText(doc: PDFDocumentProxy, n: number): Promise<PageTextData> {
  const page = await doc.getPage(n);
  // Normalized, so a printed "ﬁ" ligature reads (and is found) as "fi".
  const content = await page.getTextContent({ includeMarkedContent: true });
  const runs = content.items.filter((item): item is TextRun & typeof item => 'str' in item);
  return { content, runs, text: pageText(runs) };
}

/** Page `n`'s text, read once into `texts` (pdf.js reads it afresh each time it is asked). */
export function textOf(texts: Map<number, Promise<PageTextData>>, doc: PDFDocumentProxy, n: number): Promise<PageTextData> {
  let text = texts.get(n);
  if (!text) {
    text = readText(doc, n);
    // A page that failed to load can be asked for again.
    text.catch(() => texts.delete(n));
    texts.set(n, text);
  }
  return text;
}

interface Kept {
  task: PDFDocumentLoadingTask;
  texts: Map<number, Promise<PageTextData>>;
  /** The pages drawn out of sight, or being drawn: settled once they are. */
  warmed: Map<number, Promise<void>>;
  /** How many readers show it. */
  readers: number;
  /** Opened by a warm that fetches only its ranges, and not yet shown, so not yet saved for offline. */
  partial: boolean;
}

// The kept rulebooks by URL, the least recently used first.
const kept = new Map<string, Kept>();

/** Closes the least recently used rulebooks past the limit that no reader shows. */
function trim() {
  for (const [src, entry] of kept) {
    if (kept.size <= KEEP) return;
    if (entry.readers > 0) continue;
    kept.delete(src);
    void entry.task.destroy();
  }
}

/** Whether a rulebook can be kept without closing one a reader shows. */
function roomFor(src: string): boolean {
  return kept.has(src) || [...kept.values()].filter((entry) => entry.readers > 0).length < KEEP;
}

/** Moves a kept rulebook to the back, the most recently used. */
function touch(src: string, entry: Kept) {
  kept.delete(src);
  kept.set(src, entry);
}

/** The rulebook at `src`, kept open: the one already kept, or opened now (if roomFor it), as a warm that fetches only its ranges if `partial`. */
function keep(src: string, partial: boolean): Kept {
  let entry = kept.get(src);
  if (!entry) {
    const opened: Kept = { task: openDocument(src, partial), texts: new Map(), warmed: new Map(), readers: 0, partial };
    // One that won't open is let go, so a reader opens it afresh (and says so).
    opened.task.promise.catch(() => {
      if (kept.get(src) === opened) kept.delete(src);
    });
    entry = opened;
  }
  touch(src, entry);
  trim();
  return entry;
}

/**
 * Once the last reader showing a kept rulebook has let it go, drops what
 * its drawings left (every page's images, a warm's among them: it has done
 * its work), so a kept rulebook holds little more than its structure. One
 * still drawing (a warm, past its turn) can't be tidied, so it is closed.
 */
function tidy(src: string, entry: Kept) {
  setTimeout(() => {
    const idle = () => entry.readers === 0 && kept.get(src) === entry;
    if (!idle()) return;
    entry.task.promise.then((doc) => doc.cleanup()).then(() => entry.warmed.clear(), () => {
      if (!idle()) return;
      kept.delete(src);
      void entry.task.destroy();
    });
  }, TIDY_MS);
}

/**
 * The rulebook at `src` if it is kept open, for a reader to show: its
 * document, and the pages' text read so far, to add to. Kept while the
 * reader shows it; `release` when it closes, which leaves it kept, tidied.
 * Null if it isn't kept.
 */
export function heldDocument(src: string): { promise: Promise<PDFDocumentProxy>; texts: Map<number, Promise<PageTextData>>; release: () => void } | null {
  const entry = kept.get(src);
  if (!entry) return null;
  entry.readers++;
  touch(src, entry);
  if (entry.partial) {
    // Shown now: the service worker saves it whole for offline, as it does
    // any rulebook opened, which the warm's requests asked it not to.
    entry.partial = false;
    void fetch(src, { method: 'HEAD' }).catch(() => {});
  }
  let held = true;
  return {
    promise: entry.task.promise,
    texts: entry.texts,
    release: () => {
      if (!held) return;
      held = false;
      entry.readers--;
      if (entry.readers === 0) tidy(src, entry);
    },
  };
}

interface Connection {
  saveData?: boolean;
  effectiveType?: string;
  type?: string;
}

/** What warmWay reads of the browser: online, the connection where it says, and the service worker. */
export interface Browser extends Online {
  connection?: Connection;
}

/**
 * How to fetch a rulebook nobody has asked for yet, if at all: 'saved' when
 * the service worker has it saved (no data, offline too); 'ranges', the
 * cited page's parts alone, on a connection the browser says is fast (4G),
 * isn't mobile data, and that the visitor hasn't asked to spare
 * (Save-Data); otherwise null. A browser that says nothing of its
 * connection (Safari, Firefox) gets no warm: it may be a phone's data.
 */
export async function warmWay(src: string, nav: Browser = navigator as Browser, store: CacheStorage | undefined = globalThis.caches): Promise<'saved' | 'ranges' | null> {
  if (await savedCopy(src, nav, store)) return 'saved';
  const connection = nav.connection;
  if (nav.onLine === false || !connection || connection.saveData) return null;
  return connection.effectiveType === '4g' && connection.type !== 'cellular' ? 'ranges' : null;
}

/** A promise that settles with `work`, or after `ms` if that is sooner. */
function within(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([work, new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); })]).finally(() => clearTimeout(timer));
}

/**
 * Gets page `n` of the rulebook at `src` ready ahead of a tap, if it is
 * worth it (warmWay) and there is room to keep it: opens and keeps the
 * rulebook and loads the page, here, outside the reader's queue, where a
 * network that stalls holds nothing up. Resolves to the rest, for the
 * queue: the page drawn once out of sight and its text read, so the reader
 * that opens the rulebook next finds both ready; it gives its place back
 * after WARM_TURN_MS at most. Null when there is nothing to do: not worth
 * it, no room, the page already warmed (a failure may be tried again), or
 * it won't load.
 */
export async function warmPage(src: string, n: number): Promise<(() => Promise<void>) | null> {
  const way = await warmWay(src);
  if (!way || !roomFor(src)) return null;
  const entry = keep(src, way === 'ranges');
  if (entry.warmed.has(n)) return null;
  let doc: PDFDocumentProxy;
  let page: PDFPageProxy;
  try {
    doc = await entry.task.promise;
    page = await doc.getPage(n);
  } catch {
    return null;
  }
  return () => {
    let warming = entry.warmed.get(n);
    if (!warming) {
      const scale = WARM_WIDTH / page.getViewport({ scale: 1 }).width;
      const canvas = document.createElement('canvas');
      warming = Promise.all([
        // The reader's own drawing asks the same way, so it uses what this one leaves.
        page.render({ canvas, viewport: page.getViewport({ scale }) }).promise,
        textOf(entry.texts, doc, n),
      ]).then(() => {}, () => {
        entry.warmed.delete(n);
      });
      entry.warmed.set(n, warming);
    }
    return within(warming, WARM_TURN_MS);
  };
}

/** Closes every kept rulebook. */
export function closeKept(): void {
  for (const entry of kept.values()) void entry.task.destroy();
  kept.clear();
}

let readers = 0;

/**
 * Says a reader has opened; returns the call for when it closes. Once none
 * is open, the visitor has left the rules page, so the kept rulebooks are
 * closed: a change of tab opens the next reader in the same commit, before
 * the check.
 */
export function readerOpens(): () => void {
  readers++;
  return () => {
    readers--;
    queueMicrotask(() => {
      if (readers === 0) closeKept();
    });
  };
}
