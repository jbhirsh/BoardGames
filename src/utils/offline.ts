// What the service worker (src/sw/sw.ts) does with each request, and the
// byte-range arithmetic it needs to answer the rulebook reader from a saved
// rulebook. Kept here, free of service-worker globals, so it can be tested.

/** How the service worker answers a request. */
export type Route =
  /** Left to the browser: the API, other sites, anything not GET or HEAD. */
  | 'skip'
  /** A page: the network when there is one, the saved app when not. */
  | 'page'
  /** A rulebook: the saved copy once it has been opened, ranges and all. */
  | 'rulebook'
  /** Part of this build's saved app (at install, or the reader's files with a rulebook): the saved copy first. */
  | 'shell'
  /** Other files of the app (box art, code split off later, the rest of pdf.js's): saved as fetched. */
  | 'asset';

/** The parts of a Request the route depends on. */
export interface RouteRequest {
  url: string;
  method: string;
  mode: string;
}

/**
 * Marks the range requests of a rulebook opened ahead of a tap (the reader
 * warming the page an answer cites), which the service worker answers
 * without saving the whole file: only the cited page's parts are fetched,
 * not a rulebook of several megabytes nobody may open.
 */
export const WARM_HEADER = 'X-Warm';

/** Whether a rulebook request may have the service worker save the whole file: any but a warm one. */
export function savesRulebook(headers: Pick<Headers, 'has'>): boolean {
  return !headers.has(WARM_HEADER);
}

/**
 * A rulebook is saved on its first open only below this size: 3 MB, in the
 * decimal megabytes the rules page shows sizes in (formatSize), so a book
 * shown as "2.9 MB" saves itself and one shown as "3.6 MB" waits for Save
 * for offline. 31 of the 58 rulebooks are under 2 MB and 38 under 3 MB;
 * none lies between 3 MB and 3 MiB (3,145,728 bytes), so either unit splits
 * them the same. The rest (up to Pandemic's 16 MB) would cost a phone
 * on mobile data several megabytes it never asked for, which the reader's
 * byte ranges (#136) exist to spare it.
 */
export const SAVE_ON_OPEN_BELOW = 3_000_000;

/** The parts of a Response the save on open depends on. */
export interface SizedResponse {
  status: number;
  headers: Pick<Headers, 'get'>;
}

/**
 * The whole rulebook's size in bytes, as a response to a request for it
 * says: a 206's Content-Range total (the reader asks for ranges) or a 200's
 * Content-Length (a HEAD, or the whole file). Null when it doesn't say
 * (`bytes 0-99/*`, a compressed body sent without a length) or answers with
 * anything else.
 */
export function rulebookSize({ status, headers }: SizedResponse): number | null {
  let size: string | undefined;
  if (status === 206) size = /^bytes \d+-\d+\/(\d+)$/.exec(headers.get('Content-Range') ?? '')?.[1];
  else if (status === 200) size = /^\d+$/.exec(headers.get('Content-Length') ?? '')?.[0];
  return size === undefined ? null : Number(size);
}

/**
 * Whether opening a rulebook saves it whole, unasked: a request that may
 * (savesRulebook), for a rulebook its response says is under
 * SAVE_ON_OPEN_BELOW, while the browser isn't asked to save data. One of
 * unknown size waits to be asked, as a large one does.
 */
export function savesOnOpen(request: Pick<Headers, 'has'>, response: SizedResponse, saveData: boolean): boolean {
  if (saveData || !savesRulebook(request)) return false;
  const size = rulebookSize(response);
  return size !== null && size < SAVE_ON_OPEN_BELOW;
}

/**
 * Whether the browser has been asked to save data (Chrome's Lite mode, a
 * data saver), from the Network Information API. Chromium gives it to
 * workers too; Safari and Firefox have none, and no other sign of it
 * reaches a service worker, so there it counts as not asked: the size limit
 * alone keeps a save on open to a few megabytes.
 */
export function savingData(navigator: object): boolean {
  return (navigator as { connection?: { saveData?: unknown } }).connection?.saveData === true;
}

const RULEBOOK = /^\/rules\/[^/]+\.pdf$/;
const ASSET = /^\/(assets|images|pdfjs)\//;

/**
 * Which of the service worker's strategies a request takes. `shell` lists the
 * paths kept in the build's saved app: the precache and the reader's files
 * (utils/precache.ts).
 */
export function routeFor({ url, method, mode }: RouteRequest, origin: string, shell: ReadonlySet<string>): Route {
  const { origin: from, pathname } = new URL(url);
  if (from !== origin || pathname.startsWith('/api/')) return 'skip';
  // A rulebook comes before pages: opened in a tab of its own (a citation
  // clicked for a new tab), it is a navigation too.
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
