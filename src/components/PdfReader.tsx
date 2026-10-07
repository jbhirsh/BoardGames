// First, so the methods pdf.js expects are there before its code runs.
import '../pdfjs/polyfills';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { getDocument, PDFWorker, TextLayer, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from 'pdfjs-dist';
import { findMatches, pageText, piecesOf, type Match, type PageText, type TextRun } from '../utils/pdfSearch';
import { startWorker } from '../pdfjs/startWorker';

// Phones can't show a PDF in an iframe (Android draws nothing, iOS only the
// first page), so the rules page draws the rulebook itself there with pdf.js:
// each page as an image with its text laid over it, which makes it
// selectable and searchable. This module is loaded only when it is needed.

// The decoders for JPEG 2000 and JBIG2 images, and the fonts PDFs name but
// don't embed. vite.config.ts copies them from pdfjs-dist into the build.
const ASSETS = '/pdfjs/';
// Pages within this distance of the screen are drawn; further ones give
// their canvas back, which keeps a 50-page rulebook within a phone's memory.
const NEAR = '1000px 0px';
// A cap on one page's canvas, in pixels: iOS refuses canvases past its
// memory budget and draws them blank.
const MAX_PIXELS = 4_000_000;

// One worker for every rulebook the page opens, started on first use. It is
// our own entry, which installs the polyfills before pdf.js's worker code.
// Handing it to getDocument as `worker` keeps it alive when a document is
// destroyed: a reader for the next tab must not find it shutting down.
let shared: { worker: PDFWorker; broken: boolean; port: Worker } | null = null;
function sharedWorker() {
  if (!shared) {
    const port = startWorker();
    const current = { worker: new PDFWorker({ port: port as never }), broken: false, port };
    port.addEventListener('error', () => { current.broken = true; });
    shared = current;
  }
  return shared;
}

type TextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>;

interface PageTextData {
  content: TextContent;
  runs: TextRun[];
  text: PageText;
}

interface Hit {
  page: number;
  match: Match;
}

/** A page's text, the same items the text layer draws, so offsets line up. */
async function readText(doc: PDFDocumentProxy, n: number): Promise<PageTextData> {
  const page = await doc.getPage(n);
  // Normalized, so a printed "ﬁ" ligature reads (and is found) as "fi".
  const content = await page.getTextContent({ includeMarkedContent: true });
  const runs = content.items.filter((item): item is TextRun & typeof item => 'str' in item);
  return { content, runs, text: pageText(runs) };
}

interface PageProps {
  doc: PDFDocumentProxy;
  n: number;
  width: number;
  ratio: number;
  textOf: (n: number) => Promise<PageTextData>;
  matches: readonly Match[];
  current: Match | null;
}

function PdfPage({ doc, n, width, ratio, textOf, matches, current }: PageProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [seen, setSeen] = useState(false);
  const [height, setHeight] = useState(ratio);
  const [layer, setLayer] = useState<{ divs: HTMLElement[]; data: PageTextData } | null>(null);

  // Whether the page is near the screen, followed as the reader scrolls.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const io = new IntersectionObserver((entries) => {
      const isNear = entries[entries.length - 1].isIntersecting;
      setNear(isNear);
      if (isNear) setSeen(true);
    }, { rootMargin: NEAR });
    io.observe(box);
    return () => io.disconnect();
  }, []);

  // The page image, drawn while the page is near the screen (or holds the
  // match being shown) and given back when it moves away.
  const drawn = near || current !== null;
  useEffect(() => {
    const canvas = canvasRef.current!;
    if (!drawn || width === 0) {
      canvas.width = canvas.height = 0;
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    doc.getPage(n).then((page) => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      setHeight(base.height / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)));
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      task = page.render({ canvas, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] });
      // A cancelled render rejects; a failed one leaves the page blank, and
      // the download link above the reader still works.
      task.promise.catch(() => {});
    }, () => {});
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, n, width, drawn]);

  // The text layer, laid once the page has come near (it is light, so it
  // stays) and again when the width changes.
  const wanted = seen || current !== null;
  useEffect(() => {
    if (!wanted || width === 0) return;
    let cancelled = false;
    let textLayer: TextLayer | null = null;
    (async () => {
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

  // Mark this page's matches in its text layer, the current one stronger.
  useEffect(() => {
    if (!layer) {
      if (current) boxRef.current?.scrollIntoView?.({ block: 'start' });
      return;
    }
    const { divs, data } = layer;
    divs.forEach((div, i) => {
      if (div.childElementCount > 0) div.textContent = data.runs[i].str;
    });
    const byItem = new Map<number, { from: number; to: number; isCurrent: boolean }[]>();
    for (const match of matches) {
      for (const piece of piecesOf(data.text, data.runs, match)) {
        const list = byItem.get(piece.item) ?? [];
        list.push({ ...piece, isCurrent: match === current });
        byItem.set(piece.item, list);
      }
    }
    let currentMark: HTMLElement | null = null;
    for (const [item, pieces] of byItem) {
      const str = data.runs[item].str;
      const parts: (string | HTMLElement)[] = [];
      let at = 0;
      for (const p of pieces.sort((a, b) => a.from - b.from)) {
        parts.push(str.slice(at, p.from));
        const mark = document.createElement('mark');
        mark.className = p.isCurrent ? 'pdf-hit pdf-hit--current' : 'pdf-hit';
        mark.textContent = str.slice(p.from, p.to);
        parts.push(mark);
        if (p.isCurrent) currentMark ??= mark;
        at = p.to;
      }
      parts.push(str.slice(at));
      divs[item].replaceChildren(...parts);
    }
    currentMark?.scrollIntoView?.({ block: 'center' });
  }, [layer, matches, current]);

  return (
    <div
      ref={boxRef}
      className="pdf-page"
      data-page={n}
      style={{ aspectRatio: `1 / ${height}` }}
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

export default function PdfReader({ src, title }: { src: string; title: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState(1.3);
  const [width, setWidth] = useState(0);
  const pagesRef = useRef<HTMLDivElement>(null);
  const texts = useRef(new Map<number, Promise<PageTextData>>());
  const place = useRef<{ page: number; into: number } | null>(null);
  const drawnWidth = useRef(0);

  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [searching, setSearching] = useState(false);
  const [scanned, setScanned] = useState(false);
  const searchId = useRef(0);

  // The rules page keys this component by the PDF, so a new rulebook gets a
  // fresh reader rather than resetting this one.
  useEffect(() => {
    let cancelled = false;
    const fail = () => {
      if (!cancelled) setFailed(true);
    };
    const { worker, broken, port } = sharedWorker();
    // A worker that never started never answers, which would leave the
    // reader loading for good.
    port.addEventListener('error', fail);
    if (broken) queueMicrotask(fail);
    const task = getDocument({
      url: src,
      worker,
      wasmUrl: `${ASSETS}wasm/`,
      standardFontDataUrl: `${ASSETS}standard_fonts/`,
      // Fetch only the parts of the file the pages on screen need (both
      // flags: a streamed request would bring the whole file anyway).
      disableAutoFetch: true,
      disableStream: true,
    });
    task.promise
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
      void task.destroy();
    };
  }, [src]);

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

  const textOf = useCallback((n: number) => {
    let text = texts.current.get(n);
    if (!text) {
      text = readText(doc!, n);
      // A page that failed to load can be asked for again.
      text.catch(() => texts.current.delete(n));
      texts.current.set(n, text);
    }
    return text;
  }, [doc]);

  async function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    if (!doc || !q) return;
    const id = ++searchId.current;
    setSearching(true);
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

  let status = '';
  if (searching) status = 'Searching…';
  else if (hits && scanned) status = 'This rulebook is a scanned image, so its text can’t be searched. Try asking the rules assistant.';
  else if (hits && hits.length === 0) status = `No matches for “${searched}”.`;
  else if (active) status = `${current + 1} of ${hits!.length} · page ${active.page}`;

  return (
    <section className="pdf-reader" aria-label={title}>
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
      {failed && <p className="pdf-note">This rulebook couldn’t be shown here. Download the PDF above instead.</p>}
      {!failed && !doc && <p className="pdf-note">Loading the rulebook…</p>}
      <div className="pdf-pages" ref={pagesRef}>
        {doc && Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage
            key={i + 1}
            doc={doc}
            n={i + 1}
            width={width}
            ratio={ratio}
            textOf={textOf}
            matches={byPage.get(i + 1) ?? NO_MATCHES}
            current={active?.page === i + 1 ? active.match : null}
          />
        ))}
      </div>
    </section>
  );
}
