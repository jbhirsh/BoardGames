// First, so the methods pdf.js expects are there before its code runs.
import '../pdfjs/polyfills';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import { findMatches, piecesOf, type Match } from '../utils/pdfSearch';
import { findCited, lineBreaks, passageStart } from '../utils/citeMatch';
import { CANT_SHOW } from './cantShow';
import { drawOrder, OFF_SCREEN, renderQueue, type RenderQueue } from '../pdfjs/renderQueue';
import { heldDocument, openDocument, readerOpens, sharedWorker, textOf as readTextOf, warmPage, type PageTextData } from '../pdfjs/documents';

// The rules page draws the rulebook itself with pdf.js rather than leaving
// it to the browser's viewer (which a phone hasn't got: Android draws
// nothing, iOS only the first page): each page as an image with its text
// laid over it, which makes it selectable and searchable, and lets a
// citation open it at its page with the passage it cites marked. This
// module is loaded only when it is needed.

// Pages within this distance of the screen are drawn; further ones give
// their canvas back, which keeps a 50-page rulebook within a phone's memory.
const NEAR = '1000px 0px';
// How many pages a reader draws at once, besides the one a citation or a
// search asks for: the worker draws one page at a time, so drawing more at
// once only finishes the one most on screen later.
const RENDERS = 1;
// A cap on one page's canvas, in pixels: iOS refuses canvases past its
// memory budget and draws them blank.
const MAX_PIXELS = 4_000_000;
// How long a page jumped to from a citation keeps its ring before it fades
// (App.css .pdf-page--cited).
const RING_MS = 1600;
// How long a jump's smooth scroll may take before the reader stops waiting
// for its scrollend (a browser without the event, or a scroll cut short).
const SCROLL_WAIT_MS = 2000;
// Someone taking the scroll over: the jump then leaves the page where they put it.
const TAKEOVER = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
// The jumps already made, by location key, rulebook and page, so going Back
// to a rules page (or reloading it) leaves it where it was rather than
// jumping again. Kept for the tab's session, which a reload outlives.
const JUMPS = 'pdf-reader:jumps';
const jumpsMade = new Set<string>();

function madeJumps(): Set<string> {
  try {
    for (const id of JSON.parse(sessionStorage.getItem(JUMPS) ?? '[]') as string[]) jumpsMade.add(id);
  } catch {
    // Storage blocked: this page load's jumps are still remembered.
  }
  return new Set(jumpsMade);
}

function rememberJump(id: string) {
  jumpsMade.add(id);
  try {
    sessionStorage.setItem(JUMPS, JSON.stringify([...jumpsMade].slice(-50)));
  } catch {
    // As above.
  }
}

/**
 * How to scroll to a page: at once for someone who asked for less motion.
 * Said outright rather than left to html{scroll-behavior}, which
 * InstantRouteScroll turns off for the route change a jump comes with.
 */
function scrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
}

/** How far below the top of the screen a jump puts a page: its scroll margin, clear of the search bar. */
function scrollMargin(box: HTMLElement): number {
  return parseFloat(getComputedStyle(box).scrollMarginTop) || 0;
}

/** How far a page's top is from where a jump puts it. */
function offTarget(box: HTMLElement): number {
  return box.getBoundingClientRect().top - scrollMargin(box);
}

/**
 * Brings a page's cited passage on screen if the jump to the page left it
 * below the fold (a tall page on a desktop) or under the search bar.
 * False if the passage isn't marked yet.
 */
function revealPassage(box: HTMLElement): boolean {
  const mark = box.querySelector<HTMLElement>('mark.pdf-hit--cited');
  if (!mark) return false;
  const { top, bottom } = mark.getBoundingClientRect();
  if (top < scrollMargin(box) || bottom > window.innerHeight) mark.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
  return true;
}

/**
 * Scrolls a page to the top of the screen. `ended` resolves when the scroll
 * is over: true if it ran its course, false if someone took it over or it
 * was cancelled.
 */
function scrollToPage(box: HTMLElement): { ended: Promise<boolean>; cancel: () => void } {
  const behavior = scrollBehavior();
  const there = Math.abs(offTarget(box)) <= 1;
  box.scrollIntoView({ block: 'start', behavior });
  // An instant scroll is over already, and one that doesn't move never ends.
  if (there || behavior === 'instant') return { ended: Promise.resolve(true), cancel: () => {} };
  let stop: (ranItsCourse: boolean) => void = () => {};
  const ended = new Promise<boolean>((resolve) => {
    const done = () => stop(true);
    const taken = () => stop(false);
    const timer = setTimeout(done, SCROLL_WAIT_MS);
    stop = (ranItsCourse) => {
      clearTimeout(timer);
      window.removeEventListener('scrollend', done);
      for (const type of TAKEOVER) window.removeEventListener(type, taken);
      resolve(ranItsCourse);
    };
    window.addEventListener('scrollend', done);
    for (const type of TAKEOVER) window.addEventListener(type, taken, { passive: true });
  });
  return { ended, cancel: () => stop(false) };
}

/** A promise with its resolve to hand, and whether it has been called. */
interface Deferred {
  promise: Promise<boolean>;
  resolve: (value: boolean) => void;
  done: boolean;
}

function deferred(): Deferred {
  const d = { done: false } as Deferred;
  d.promise = new Promise<boolean>((resolve) => {
    d.resolve = (value) => {
      d.done = true;
      resolve(value);
    };
  });
  return d;
}

/**
 * The screen's device pixel ratio, followed as it changes: browser zoom
 * (ctrl-plus) changes it, often without changing the column's width in CSS
 * pixels, and pages drawn for the old ratio would be blurred.
 */
function usePixelRatio(): number {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    // Matches only the ratio it was made for, so it changes when that does.
    const query = window.matchMedia(`(resolution: ${ratio}dppx)`);
    const changed = () => setRatio(window.devicePixelRatio || 1);
    // Safari before 14 has only the older addListener; there a zoom keeps
    // the pages drawn as they were.
    query.addEventListener?.('change', changed);
    return () => query.removeEventListener?.('change', changed);
  }, [ratio]);
  return ratio;
}

/**
 * Text for a live region, a way to say it, and a way to add to it: said
 * by emptying the region first and setting it a frame later, so the same
 * words said twice are read out twice. What is added joins words not yet
 * said, as one update, or follows them as an update of its own.
 */
function useAnnouncement(): [string, (text: string) => void, (more: string) => void] {
  const [text, setText] = useState('');
  const frame = useRef(0);
  // The words waiting for their frame.
  const coming = useRef<string | null>(null);
  const say = useCallback((next: string) => {
    cancelAnimationFrame(frame.current);
    setText('');
    coming.current = next;
    frame.current = requestAnimationFrame(() => {
      coming.current = null;
      setText(next);
    });
  }, []);
  const add = useCallback((more: string) => say(coming.current === null ? more : `${coming.current}. ${more}`), [say]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return [text, say, add];
}

interface Hit {
  page: number;
  match: Match;
}

interface PageProps {
  doc: PDFDocumentProxy;
  n: number;
  width: number;
  /** The screen's device pixel ratio, which the page image is drawn for. */
  pixels: number;
  ratio: number;
  textOf: (n: number) => Promise<PageTextData>;
  matches: readonly Match[];
  current: Match | null;
  /** The passage a citation points to, when it is on this page. */
  quoted: Match | null;
  /** How many pages the rulebook has, for the page's name. */
  total: number;
  /** The page's height to width, when the reader has read it ahead of drawing. */
  known: number | undefined;
  /** Set while a citation asks for this page: the jump's key, new for each tap. */
  cited: string | null;
  /** Called as a jump to this page starts. */
  onJump: () => void;
  /**
   * Called once a jump to this page is over: scrolled there with the page
   * drawn (or failed to draw), or the scroll taken over (`takenOver`).
   */
  onLanded: (takenOver: boolean) => void;
  /**
   * Set while a jump is on its way: the page starts no drawing for coming
   * near, nor lays its text, so neither the pages on screen as a tab opens
   * nor those the scroll passes hold up the one asked for.
   */
  held: boolean;
  /** Set while a jump to this page is on its way: drawn at once, wherever it is. */
  leads: boolean;
  /** The reader's queue of pages to draw. */
  queue: RenderQueue;
  /** Called once the page knows whether it is near the screen, and has asked to be drawn if it is. */
  onPlaced: () => void;
}

function PdfPage({ doc, n, width, pixels, ratio, textOf, matches, current, quoted, total, known, cited, onJump, onLanded, held, leads, queue, onPlaced }: PageProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  // Whether the page is near, as far as drawing goes: kept as it was while
  // the page is held, so one already drawn stays drawn and one that isn't
  // waits, then caught up once the jump is over.
  const [live, setLive] = useState(false);
  const [seen, setSeen] = useState(false);
  if (!held && live !== near) {
    setLive(near);
    // Coming near, or going away, which it can only do once seen.
    setSeen(true);
  }
  const [height, setHeight] = useState(ratio);
  // Settled once the canvas holds the page's image (true) or the drawing
  // failed (false), and afresh each time it is given back and drawn again.
  const [firstPaint] = useState(deferred);
  const painted = useRef(firstPaint);
  const [layer, setLayer] = useState<{ divs: HTMLElement[]; data: PageTextData } | null>(null);
  // Set once a jump here is over, until the cited passage has been brought
  // on screen (it may be marked only after: its text layer waits for the jump).
  const reveal = useRef(false);

  // Whether the page is near the screen, followed as the reader scrolls.
  const placed = useEffectEvent(onPlaced);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const io = new IntersectionObserver((entries) => {
      setNear(entries[entries.length - 1].isIntersecting);
      placed();
    }, { rootMargin: NEAR });
    io.observe(box);
    return () => io.disconnect();
  }, []);

  // The page image, drawn while the page is near the screen (or holds the
  // match being shown, or was cited, or a jump is on its way to it) and
  // given back when it moves away. It waits its turn in the reader's queue:
  // the page asked for first, then those on screen, then the nearest. Its
  // text is read in the same turn, before the next page starts, since it
  // is laid over this one. `drawing` settles once the turn is over (or the
  // drawing called off).
  const asked = leads || current !== null || cited !== null;
  const drawn = live || asked;
  const drawing = useRef<Promise<unknown>>(Promise.resolve());
  // A page gone (its reader closing) is asked its place no more; until its
  // job is taken out, it goes after those on screen.
  const order = useEffectEvent(() => {
    const box = boxRef.current;
    return box ? drawOrder(box.getBoundingClientRect(), window.innerHeight, asked) : OFF_SCREEN;
  });
  useEffect(() => {
    const canvas = canvasRef.current!;
    // The image drawn before (or the failure) is going, so a new promise.
    if (painted.current.done) painted.current = deferred();
    if (!drawn || width === 0) {
      canvas.width = canvas.height = 0;
      drawing.current = Promise.resolve();
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    let over = () => {};
    drawing.current = new Promise((resolve) => { over = () => resolve(undefined); });
    // Called off while loading its page, before there is a drawing to
    // cancel, it gives its place in the queue back at once all the same.
    let stop = () => {};
    const stopped = new Promise<void>((resolve) => { stop = resolve; });
    // A cancelled render rejects too; it leaves the promise to the drawing after it.
    const failed = () => {
      if (!cancelled) painted.current.resolve(false);
    };
    const draw = () => doc.getPage(n).then((page) => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      setHeight(base.height / base.width);
      const dpr = Math.min(pixels, 2, Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)));
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      task = page.render({ canvas, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] });
      // A failed render leaves the page blank, and the download link above
      // the reader still works.
      return task.promise.then(() => painted.current.resolve(true), failed);
    }, failed);
    const dequeue = queue.add({
      order: () => order(),
      run: async () => {
        try {
          await Promise.race([stopped, (async () => {
            await draw();
            if (!cancelled) await textOf(n);
          })()]);
        } finally {
          over();
        }
      },
    });
    return () => {
      cancelled = true;
      stop();
      dequeue();
      task?.cancel();
      over();
    };
  }, [doc, n, width, pixels, drawn, queue, textOf]);

  // A page already waiting its turn when it is asked for goes ahead now.
  useEffect(() => {
    if (asked) queue.next();
  }, [asked, queue]);

  // The text layer, laid once the page has come near (it is light, so it
  // stays) and again when the width changes; after the page's drawing,
  // which it would otherwise slow.
  const wanted = seen || current !== null;
  useEffect(() => {
    if (!wanted || width === 0) return;
    let cancelled = false;
    let textLayer: TextLayer | null = null;
    const turn = drawing.current;
    (async () => {
      await turn;
      if (cancelled) return;
      const page = await doc.getPage(n);
      const data = await textOf(n);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      const container = textRef.current!;
      container.replaceChildren();
      container.style.setProperty('--total-scale-factor', String(viewport.scale));
      textLayer = new TextLayer({ textContentSource: data.content, container, viewport });
      await textLayer.render();
      if (!cancelled) setLayer({ divs: textLayer.textDivs, data });
    })().catch(() => {});
    return () => {
      cancelled = true;
      textLayer?.cancel();
    };
  }, [doc, n, width, wanted, textOf]);

  // Mark this page's matches in its text layer, the current one stronger,
  // and the passage a citation points to like a match.
  useEffect(() => {
    if (!layer) {
      if (current) boxRef.current?.scrollIntoView?.({ block: 'start' });
      return;
    }
    const { divs, data } = layer;
    divs.forEach((div, i) => {
      if (div.childElementCount > 0) div.textContent = data.runs[i].str;
    });
    type Marked = { from: number; to: number; className: string; isCurrent: boolean };
    const byItem = new Map<number, Marked[]>();
    for (const match of matches) {
      const className = match === current ? 'pdf-hit pdf-hit--current' : 'pdf-hit';
      for (const { item, from, to } of piecesOf(data.text, data.runs, match)) {
        byItem.set(item, [...(byItem.get(item) ?? []), { from, to, className, isCurrent: match === current }]);
      }
    }
    // The cited passage around them: a search's matches inside it stay
    // marked as matches, the current one too.
    for (const piece of quoted ? piecesOf(data.text, data.runs, quoted) : []) {
      const hits = byItem.get(piece.item) ?? [];
      const cited: Marked[] = [];
      let from = piece.from;
      for (const hit of [...hits, { from: piece.to, to: piece.to }].sort((a, b) => a.from - b.from)) {
        const to = Math.min(hit.from, piece.to);
        if (to > from) cited.push({ from, to, className: 'pdf-hit pdf-hit--cited', isCurrent: false });
        from = Math.max(from, hit.to);
      }
      byItem.set(piece.item, [...hits, ...cited]);
    }
    let currentMark: HTMLElement | null = null;
    for (const [item, pieces] of byItem) {
      const str = data.runs[item].str;
      const parts: (string | HTMLElement)[] = [];
      let at = 0;
      for (const p of pieces.sort((a, b) => a.from - b.from)) {
        parts.push(str.slice(at, p.from));
        const el = document.createElement('mark');
        el.className = p.className;
        el.textContent = str.slice(p.from, p.to);
        parts.push(el);
        if (p.isCurrent) currentMark ??= el;
        at = p.to;
      }
      parts.push(str.slice(at));
      divs[item].replaceChildren(...parts);
    }
    currentMark?.scrollIntoView?.({ block: 'center' });
    if (reveal.current && revealPassage(boxRef.current!)) reveal.current = false;
  }, [layer, matches, current, quoted]);

  // A citation's jump. The reader asks for it once every page above this
  // one has its own height, so none moves the page as the scroll passes:
  // focus goes to the page first, without scrolling, so a screen reader
  // says where the reader went ("Page 5 of 16"); then the scroll, by the
  // path a search takes, put right at the end if something above shifted
  // anyway (unless someone took the scroll over). Once the scroll is over
  // and the page's image is drawn, it is ringed for a moment. Until then
  // the other pages draw nothing new (this one was started first, as soon
  // as the jump was asked for), unless someone takes the scroll over: they
  // are going somewhere else. Then the passage the citation points to, if
  // one was found and the page is tall enough to hide it, is brought on
  // screen, unless someone took the scroll over.
  const jumped = useEffectEvent(onJump);
  const landed = useEffectEvent(onLanded);
  useEffect(() => {
    const box = boxRef.current;
    if (cited === null || !box) return;
    jumped();
    box.focus({ preventScroll: true });
    const scroll = scrollToPage(box);
    let cancelled = false;
    let fade: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const ranItsCourse = await scroll.ended;
      if (cancelled) return;
      if (ranItsCourse && Math.abs(offTarget(box)) > 1) box.scrollIntoView({ block: 'start', behavior: 'instant' });
      if (!ranItsCourse) landed(true);
      const drew = await painted.current.promise;
      if (cancelled) return;
      landed(!ranItsCourse);
      if (ranItsCourse) reveal.current = !revealPassage(box);
      if (!drew) return;
      box.classList.add('pdf-page--cited');
      fade = setTimeout(() => box.classList.remove('pdf-page--cited'), RING_MS);
    })();
    return () => {
      cancelled = true;
      scroll.cancel();
      clearTimeout(fade);
      reveal.current = false;
      box.classList.remove('pdf-page--cited');
    };
  }, [cited]);

  return (
    <div
      ref={boxRef}
      className="pdf-page"
      data-page={n}
      role="group"
      aria-label={`Page ${n} of ${total}`}
      tabIndex={-1}
      style={{ aspectRatio: `1 / ${known ?? height}` }}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div ref={textRef} className="textLayer" />
    </div>
  );
}

const NO_MATCHES: readonly Match[] = [];

/** Which page is at the top of the screen, and how far into it. */
function readingPlace(pages: HTMLElement): { page: number; into: number } | null {
  for (const [i, el] of [...pages.children].entries()) {
    const box = el.getBoundingClientRect();
    if (box.bottom > 0 && box.height > 0) return { page: i, into: Math.max(0, -box.top) / box.height };
  }
  return null;
}

/**
 * A citation's request for a page: `key` is new for each tap, `place` names
 * the rulebook, and `quote` is the answer's words the citation closes, whose
 * passage on the page is marked when it can be found.
 */
export interface Jump {
  page: number;
  key: string;
  place?: string;
  quote?: string;
}

/** A cited passage: where it is in its page's text, and its first words. */
interface Passage {
  match: Match;
  start: string;
}

/** A page an answer cites in another rulebook, to have ready before it is tapped. */
export interface Warm {
  src: string;
  page: number;
}

/**
 * `jump` asks for a page, from a citation: the reader scrolls there once the
 * page is laid out, again for each new `key`, but not for one it has
 * already made (Back, a reload). `warm` names pages in other rulebooks an
 * answer cites, opened and drawn out of sight ahead of a tap (each once).
 * `onFail` hears that the rulebook at `src` can't be shown, and `failNote`, if
 * given, is what is shown instead (null for nothing yet).
 */
export default function PdfReader({ src, title, jump, warm, onFail, failNote = CANT_SHOW }: { src: string; title: string; jump?: Jump; warm?: readonly Warm[]; onFail?: (src: string) => void; failNote?: ReactNode }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const failedNow = useEffectEvent(() => onFail?.(src));
  const [ratio, setRatio] = useState(1.3);
  const [width, setWidth] = useState(0);
  const pixels = usePixelRatio();
  const pagesRef = useRef<HTMLDivElement>(null);
  const texts = useRef(new Map<number, Promise<PageTextData>>());
  const place = useRef<{ page: number; into: number } | null>(null);
  const drawnWidth = useRef(0);
  const [queue] = useState(() => renderQueue(RENDERS));

  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [searching, setSearching] = useState(false);
  const [scanned, setScanned] = useState(false);
  const searchId = useRef(0);
  // The jump whose marked passage a search has since cleared.
  const [unmarked, setUnmarked] = useState<string | null>(null);

  // The rules page keys this component by the PDF, so a new rulebook gets a
  // fresh reader rather than resetting this one.
  useEffect(() => {
    let cancelled = false;
    const fail = () => {
      if (cancelled) return;
      setFailed(true);
      failedNow();
    };
    const { broken, port } = sharedWorker();
    // A worker that never started never answers, which would leave the
    // reader loading for good.
    port.addEventListener('error', fail);
    if (broken) queueMicrotask(fail);
    // A rulebook opened ahead of a tap (warmPage) is shown as it is, with
    // the text already read, and left open for the rules page to close. If
    // it won't load after all (the warm's network gave out), it is opened
    // afresh, once.
    const held = heldDocument(src);
    let task = held ? null : openDocument(src);
    if (held) texts.current = held.texts;
    const loaded = held
      ? held.promise.catch(() => {
        held.release();
        if (cancelled) throw new Error('closed');
        texts.current = new Map();
        task = openDocument(src);
        return task.promise;
      })
      : task!.promise;
    loaded
      .then(async (pdf) => {
        const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
        if (cancelled) return;
        setRatio(first.height / first.width);
        setDoc(pdf);
      })
      .catch(fail);
    return () => {
      cancelled = true;
      port.removeEventListener('error', fail);
      held?.release();
      void task?.destroy();
    };
  }, [src]);

  // The rulebooks kept open are closed once the rules page is left.
  useEffect(() => readerOpens(), []);

  // As an answer citing other rulebooks lands, rather than when one is
  // tapped: in the queue, after the pages on screen but before those near
  // it, which the visitor reading the answer isn't looking at. Not before
  // this reader's own rulebook is open and its pages know where they are,
  // so those on screen are in the queue ahead of it.
  const [placed, setPlaced] = useState(false);
  const onPlaced = useCallback(() => setPlaced(true), []);
  // The rulebook is opened and the page loaded first, outside the queue,
  // where a network that stalls holds none of this reader's pages up.
  useEffect(() => {
    if (!placed) return;
    let cancelled = false;
    const dequeues: (() => void)[] = [];
    for (const w of warm ?? []) {
      if (w.src === src) continue;
      void warmPage(w.src, w.page).then((draw) => {
        if (draw && !cancelled) dequeues.push(queue.add({ order: () => OFF_SCREEN, run: draw }));
      });
    }
    return () => {
      cancelled = true;
      dequeues.forEach((dequeue) => dequeue());
    };
  }, [placed, warm, src, queue]);

  // Pages are drawn to the column's width and redrawn if it changes (a phone
  // turned sideways). Every page's height changes with it, so the reader
  // keeps its place: the page at the top stays at the top.
  useEffect(() => {
    const box = pagesRef.current;
    if (!box) return;
    const remember = () => {
      // Turning the phone scrolls the page as it reflows; that isn't the
      // reader's place, so only remember it at the width pages were drawn at.
      if (Math.floor(box.getBoundingClientRect().width) === drawnWidth.current) place.current = readingPlace(box);
    };
    window.addEventListener('scroll', remember, { passive: true });
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(box);
    return () => {
      window.removeEventListener('scroll', remember);
      ro.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    drawnWidth.current = width;
    const box = pagesRef.current;
    const at = place.current;
    const el = at && box?.children[at.page];
    if (!el || window.scrollY === 0) return;
    const top = el.getBoundingClientRect();
    window.scrollBy(0, top.top + at.into * top.height);
  }, [width]);

  const textOf = useCallback((n: number) => readTextOf(texts.current, doc!, n), [doc]);

  async function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    if (!doc || !q) return;
    const id = ++searchId.current;
    setSearching(true);
    setUnmarked(jumpId);
    // Every page's text at once: each may be its own download.
    const pages = await Promise.all(Array.from({ length: doc.numPages }, (_, i) =>
      // A page that won't load is left out; the rest are still searched.
      textOf(i + 1).then(({ text }) => text.text, () => '')));
    const found: Hit[] = pages.flatMap((text, i) => findMatches(text, q).map((match) => ({ page: i + 1, match })));
    const anyText = pages.some((text) => text.trim() !== '');
    if (id !== searchId.current) return;
    setSearching(false);
    setSearched(q);
    setScanned(!anyText);
    setHits(found);
    setCurrent(0);
  }

  const byPage = useMemo(() => {
    const map = new Map<number, Match[]>();
    for (const hit of hits ?? []) map.set(hit.page, [...(map.get(hit.page) ?? []), hit.match]);
    return map;
  }, [hits]);

  const active = hits && hits.length > 0 ? hits[current] : null;
  const step = (by: number) => setCurrent((c) => (c + by + hits!.length) % hits!.length);

  // A citation's jump, unless this reader's page was already left there:
  // the jumps made before it opened are passed over.
  const [made] = useState(madeJumps);
  const jumpId = jump ? `${jump.key} ${src} ${jump.page}` : null;
  const wanted = jump && jumpId !== null && !made.has(jumpId) ? jump : null;
  const target = doc && wanted && wanted.page <= doc.numPages ? wanted : null;
  const missing = doc && wanted && wanted.page > doc.numPages ? wanted.page : null;
  const pageCount = doc?.numPages ?? 0;

  // The heights of the pages up to the one jumped to, read before the jump
  // (a page is otherwise sized like the first until it is drawn), so a
  // rulebook of mixed page sizes doesn't move the page as the scroll passes.
  // Meanwhile the cited page's text is searched for the passage the
  // citation points to, which is marked when it is found: the jump doesn't
  // wait for it, since the worker reads the text only once it has worked
  // out how to draw the page, a second or more on a phone.
  const [known, setKnown] = useState<{ id: string | null; ratios: (number | undefined)[] }>({ id: null, ratios: [] });
  const [found, setFound] = useState<{ id: string | null; passage: Passage | null }>({ id: null, passage: null });
  const upTo = target?.page;
  const quote = target?.quote;
  useEffect(() => {
    if (!doc || upTo === undefined || jumpId === null) return;
    let cancelled = false;
    void Promise.all(Array.from({ length: upTo }, (_, i) => doc.getPage(i + 1).then((page) => {
      const base = page.getViewport({ scale: 1 });
      return base.height / base.width;
    }, () => undefined))).then((ratios) => {
      if (cancelled) return;
      setKnown((prev) => ({
        id: jumpId,
        ratios: Array.from({ length: Math.max(prev.ratios.length, ratios.length) }, (_, i) => ratios[i] ?? prev.ratios[i]),
      }));
    });
    if (quote) {
      void textOf(upTo).then(({ runs, text }): Passage | null => {
        const match = findCited(text.text, quote, lineBreaks(runs, text.starts));
        return match && { match, start: passageStart(text.text.slice(...match)) };
      }, () => null).then((passage) => {
        if (!cancelled) setFound({ id: jumpId, passage });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [doc, upTo, jumpId, quote, textOf]);
  const cited = target && known.id === jumpId ? target : null;
  // Marked from the jump until the next jump or search.
  const passage = cited && unmarked !== jumpId && found.id === jumpId ? found.passage : null;
  // From the moment a jump is asked for until it is over, the page it goes
  // to is drawn first, and no other page starts drawing: the pages on
  // screen as a tab opens, and those the scroll passes, would otherwise be
  // drawn ahead of it (and slow the reading of the heights above), and the
  // ring waits for its image.
  //
  // Where a jump went is said politely once it is there (or the scroll is
  // taken over), with the first words of the passage it marked: "Base game,
  // page 5. Highlighted: roll a 7…". The page's text is read by then, as a
  // rule; a passage found only after adds its words then: to the place, if
  // that is still to be said, or after it, unless the visitor took the
  // scroll over, and has gone on to read something else.
  const [said, say, add] = useAnnouncement();
  // The jump whose place has been said, and whether its passage may still be.
  const told = useRef<{ id: string; more: boolean } | null>(null);
  const book = target?.place;
  const marked = passage?.start;
  const [landedId, setLandedId] = useState<string | null>(null);
  // Only the cited page calls these, so there is a jump.
  const onJump = useCallback(() => rememberJump(jumpId!), [jumpId]);
  const onLanded = useCallback((takenOver: boolean) => {
    setLandedId(jumpId);
    if (told.current?.id === jumpId) return;
    told.current = { id: jumpId!, more: marked === undefined && !takenOver };
    const where = book ? `${book}, page ${upTo}` : `Page ${upTo}`;
    say(marked ? `${where}. Highlighted: ${marked}` : where);
  }, [jumpId, upTo, book, marked, say]);
  const going = target && landedId !== jumpId ? target.page : null;
  useEffect(() => {
    const jumped = told.current;
    if (marked === undefined || jumped?.id !== jumpId || !jumped.more) return;
    jumped.more = false;
    add(`Highlighted: ${marked}`);
  }, [marked, jumpId, add]);

  // A citation past the end: the model got the page wrong, so say so rather
  // than guess which page it meant, again for each tap.
  const [noted, note] = useAnnouncement();
  const missingId = missing === null ? null : jumpId;
  useEffect(() => {
    if (missingId === null) return;
    rememberJump(missingId);
    note(`This rulebook has ${pageCount} pages, so it has no page ${missing}.`);
  }, [missingId, missing, pageCount, note]);

  let status = '';
  if (searching) status = 'Searching…';
  else if (hits && scanned) status = 'This rulebook is a scanned image, so its text can’t be searched. Try asking the rules assistant.';
  else if (hits && hits.length === 0) status = `No matches for “${searched}”.`;
  else if (active) status = `${current + 1} of ${hits!.length} · page ${active.page}`;
  else if (missing !== null) status = noted;

  return (
    <section className="pdf-reader" aria-label={title}>
      {/* Not once the rulebook has failed, with nothing to search. */}
      {!failed && (
        <div className="pdf-search">
          <form role="search" className="pdf-search-form" onSubmit={search}>
            <input
              type="search"
              aria-label="Search the rulebook"
              placeholder="Search the rulebook"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              enterKeyHint="search"
            />
            <button type="submit" disabled={!doc}>Search</button>
          </form>
          {/* Always in the page, so a screen reader hears its first message. */}
          <div className={status ? 'pdf-search-results' : 'pdf-search-results pdf-search-results--idle'}>
            <p className="pdf-search-status" role="status">{status}</p>
            {!searching && hits && hits.length > 1 && (
              <span className="pdf-search-nav">
                <button type="button" aria-label="Previous match" onClick={() => step(-1)}>&uarr;</button>
                <button type="button" aria-label="Next match" onClick={() => step(1)}>&darr;</button>
              </span>
            )}
          </div>
        </div>
      )}
      {/* Not the status line, whose growing would move the pages mid-jump. */}
      <div className="sr-only" aria-live="polite">{said}</div>
      {failed && failNote}
      {!failed && !doc && <p className="pdf-note">Loading the rulebook…</p>}
      <div className="pdf-pages" ref={pagesRef}>
        {doc && Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage
            key={i + 1}
            doc={doc}
            n={i + 1}
            width={width}
            pixels={pixels}
            ratio={ratio}
            textOf={textOf}
            matches={byPage.get(i + 1) ?? NO_MATCHES}
            current={active?.page === i + 1 ? active.match : null}
            quoted={cited?.page === i + 1 ? passage?.match ?? null : null}
            total={doc.numPages}
            known={known.ratios[i]}
            cited={cited?.page === i + 1 ? cited.key : null}
            onJump={onJump}
            onLanded={onLanded}
            held={going !== null}
            leads={going === i + 1}
            queue={queue}
            onPlaced={onPlaced}
          />
        ))}
      </div>
    </section>
  );
}
