// What the service worker (src/sw/sw.ts) does with each request, and the
// byte-range arithmetic it needs to answer the phone reader from a saved
// rulebook. Kept here, free of service-worker globals, so it can be tested.

/** How the service worker answers a request. */
export type Route =
  /** Left to the browser: the API, other sites, anything not GET or HEAD. */
  | 'skip'
  /** A page: the network when there is one, the saved app when not. */
  | 'page'
  /** A rulebook: the saved copy once it has been opened, ranges and all. */
  | 'rulebook'
  /** Part of the app saved at install: the saved copy first. */
  | 'shell'
  /** Other files of the app (box art, code split off later): saved as fetched. */
  | 'asset';

/** The parts of a Request the route depends on. */
export interface RouteRequest {
  url: string;
  method: string;
  mode: string;
}

const RULEBOOK = /^\/rules\/[^/]+\.pdf$/;
const ASSET = /^\/(assets|images|pdfjs)\//;

/**
 * Which of the service worker's strategies a request takes. `shell` lists the
 * paths saved at install (the precache).
 */
export function routeFor({ url, method, mode }: RouteRequest, origin: string, shell: ReadonlySet<string>): Route {
  const { origin: from, pathname } = new URL(url);
  if (from !== origin || pathname.startsWith('/api/')) return 'skip';
  // A rulebook comes before pages: on a desktop it opens in an iframe, which
  // is a navigation too.
  if (RULEBOOK.test(pathname) && (method === 'GET' || method === 'HEAD')) return 'rulebook';
  if (method !== 'GET') return 'skip';
  if (mode === 'navigate') return 'page';
  if (shell.has(pathname)) return 'shell';
  return ASSET.test(pathname) ? 'asset' : 'skip';
}

/** One byte range, both ends inclusive, as HTTP counts them. */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * The range a `Range` header asks for out of `size` bytes: null for no header
 * or one that isn't a valid range (send the whole file, as HTTP says), and
 * 'unsatisfiable' for one that starts past the end (416).
 * Only the single ranges pdf.js sends are understood: `bytes=a-b`, `bytes=a-`
 * and `bytes=-n`; a multi-range header is answered with the whole file, as
 * HTTP allows.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | 'unsatisfiable' {
  if (!header) return null;
  // `bytes=-` and a range ending before it starts aren't ranges at all.
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  const [, from, to] = match;
  if (from === '') {
    // The last n bytes.
    const n = Number(to);
    if (n === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(from);
  if (to !== '' && Number(to) < start) return null;
  if (start >= size) return 'unsatisfiable';
  return { start, end: to === '' ? size - 1 : Math.min(Number(to), size - 1) };
}

/** Headers for a 206 answering `range` out of a file of `size` bytes. */
export function rangeHeaders(range: ByteRange, size: number, type: string): Record<string, string> {
  return {
    'Content-Type': type,
    'Content-Length': String(range.end - range.start + 1),
    'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
    'Accept-Ranges': 'bytes',
  };
}
