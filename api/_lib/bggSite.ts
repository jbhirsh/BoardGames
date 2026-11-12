// What BoardGameGeek's own site answers by id, with no token, for what its
// XML API lacks (bgg.ts uses it beside that API): `geekitems` has the
// one-line summary BGG writes for each game (`short_description`) and its
// honours (`links.boardgamehonor`), `dynamicinfo` the weight of a game
// nobody looks up by name (the collection's). They're undocumented, so a
// failure here never costs a lookup, and every function answers null or
// undefined rather than throwing. Also BGG's text decoding, which the XML
// API's answers need too.
//
// Imports nothing of the app's own: the scripts (scripts/copy-from-redis.ts,
// bgg-refresh.ts) load it with Node, which doesn't resolve the API's
// `./x.js` imports to their `.ts` files.

/** What a lookup fetches with: `fetch`, or a fake in tests. */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ status: number; text(): Promise<string> }>;

// BGG double-encodes the description (`&amp;mdash;` in the XML means the
// text holds `&mdash;`), so decoding runs twice.
export function decodeEntities(s: string): string {
  return decodeOnce(decodeOnce(s));
}

const codePoint = (n: number, raw: string) => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : raw);

// The named entities BGG's descriptions use: typographic punctuation and
// symbols here, accented letters by DIACRITIC below. Any other name is left
// as written.
const NAMED: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  bull: '•',
  middot: '·',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  prime: '′',
  Prime: '″',
  iexcl: '¡',
  iquest: '¿',
  shy: '\u00ad',
  trade: '™',
  copy: '©',
  reg: '®',
  deg: '°',
  times: '×',
  divide: '÷',
  plusmn: '±',
  minus: '−',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  sup2: '²',
  sup3: '³',
  euro: '€',
  pound: '£',
  cent: '¢',
  sect: '§',
  aelig: 'æ',
  AElig: 'Æ',
  oelig: 'œ',
  OElig: 'Œ',
  oslash: 'ø',
  Oslash: 'Ø',
  szlig: 'ß',
  eth: 'ð',
  ETH: 'Ð',
  thorn: 'þ',
  THORN: 'Þ',
};

// `&eacute;` is "e" plus a combining acute accent, composed into "é".
const DIACRITIC: Record<string, string> = {
  grave: '\u0300',
  acute: '\u0301',
  circ: '\u0302',
  tilde: '\u0303',
  uml: '\u0308',
  ring: '\u030a',
  cedil: '\u0327',
  caron: '\u030c',
};

function named(raw: string, name: string): string {
  if (Object.hasOwn(NAMED, name)) return NAMED[name];
  const m = /^([a-zA-Z])([a-z]+)$/.exec(name);
  const mark = m && Object.hasOwn(DIACRITIC, m[2]) ? DIACRITIC[m[2]] : undefined;
  const composed = m && mark ? (m[1] + mark).normalize('NFC') : '';
  return composed.length === 1 ? composed : raw;
}

// One pass, so `&amp;rsquo;` becomes `&rsquo;` here and `’` on the next.
function decodeOnce(s: string): string {
  return s
    .replace(/&#(\d+);/g, (raw: string, n: string) => codePoint(Number(n), raw))
    .replace(/&#x([0-9a-f]+);/gi, (raw: string, h: string) => codePoint(parseInt(h, 16), raw))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, named);
}

// Anchored on whitespace so `name=` never matches inside `friendlyname=`.
export const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1];

// Repeated until nothing changes, so removing one tag can't leave another
// (`<scr<b>ipt>`) behind.
function stripTags(s: string): string {
  let previous: string;
  do {
    previous = s;
    s = s.replace(/<[^>]*>/g, '');
  } while (s !== previous);
  return s;
}

/**
 * BGG's whole description as plain text: entities decoded, markup and
 * control characters gone, whitespace collapsed. Only one longer than `max`
 * is shortened, to the whole sentences that fit (or, failing that, cut on a
 * word with an ellipsis).
 */
export function cleanText(raw: string, max: number): string {
  // Control and format characters (a soft hyphen from &#173;, zero-width
  // joiners) go, as an edit would refuse them; newlines and tabs are left
  // for the whitespace collapse, so the words either side stay apart.
  // A block tag (a line break, paragraph or list item) parts the words
  // either side; an inline one (BGG italicises titles) goes without a trace,
  // so "<i>Inkwell</i>," doesn't become "Inkwell ,".
  const text = stripTags(decodeEntities(raw).replace(/<\/?(?:br|p|div|li|ul|ol|h[1-6])\b[^>]*>/gi, ' '))
    .replace(/(?!\s)\p{C}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  // Split after sentence punctuation followed by whitespace, so decimals
  // like "2.0" stay whole.
  let out = '';
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > max) break;
    out = next;
  }
  return out || text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

/**
 * A weight as BGG writes it (a decimal string, and how many rated it),
 * rounded to two places, or null when nobody has rated it or it's out of
 * BGG's 1 to 5.
 */
export function weightOf(avg: unknown, votes: unknown): number | null {
  const weight = Number(avg);
  if (!(Number(votes) > 0) || !(weight >= 1 && weight <= 5)) return null;
  return Math.round(weight * 100) / 100;
}

/**
 * One of a game's honours as BGG lists it: the award, its year, and how the
 * game placed. A `result` of `Winner` is a win, whatever BGG's own word for
 * a single-tier award (which has none, so it reads as a win).
 */
export interface Honour {
  name: string;
  year: number | null;
  result: string;
}

/** The results BGG ends an honour's name with, longest first so "Special Mention" isn't read as "Mention". */
const RESULTS = [
  'Honorable Mention',
  'Special Mention',
  'Recommended',
  'Runner-up',
  'Inductee',
  'Finalist',
  'Nominee',
  'Winner',
];

/**
 * An honour's name as BGG writes it ("2017 Golden Geek Best Cooperative
 * Game Nominee") split into the award, the year and the result. A leading
 * year is the year; a known result word at the end is the result; `Nth
 * Place`, `d'Argent` (second) and `de Bronze` (third) are placings; an
 * honour with none of these is a single-tier award, which BGG lists only
 * for the games that won it, so it's a win. Never throws.
 */
export function parseHonour(raw: string): Honour {
  let rest = raw.replace(/\s+/g, ' ').trim();
  let year: number | null = null;
  const y = /^(\d{4})\s+(.*)$/.exec(rest);
  if (y) {
    year = Number(y[1]);
    rest = y[2];
  }
  const lower = rest.toLowerCase();
  const word = RESULTS.find((r) => lower.endsWith(` ${r.toLowerCase()}`) || lower === r.toLowerCase());
  if (word)
    return { name: rest.slice(0, rest.length - word.length).replace(/[\s:–-]+$/, '') || rest, year, result: word };
  const place = /^(.*?)[\s:–-]*\b(\d+)(?:st|nd|rd|th) Place$/i.exec(rest);
  if (place) return { name: place[1] || rest, year, result: `${place[2]}${ordinal(Number(place[2]))} Place` };
  if (/ d['’]Argent$/i.test(rest)) return { name: rest, year, result: '2nd Place' };
  if (/ de Bronze$/i.test(rest)) return { name: rest, year, result: '3rd Place' };
  return { name: rest, year, result: 'Winner' };
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

/** What BGG's site has for a game that its XML API doesn't. */
export interface BggItem {
  /** BGG's primary name, when it gave one. */
  name?: string;
  /** BGG's one-line summary, absent when it has none. */
  summary?: string;
  honours: Honour[];
}

/** BGG's site API, which answers by id with no token (geekitems, dynamicinfo). */
const SITE = 'https://api.geekdo.com/api';

/** A JSON answer from BGG's site API within the deadline, or undefined for any failure. */
async function siteJson(fetchLike: FetchLike, url: string, deadline: number): Promise<unknown> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return undefined;
  try {
    const r = await fetchLike(url, { signal: AbortSignal.timeout(remaining) });
    if (r.status !== 200) return undefined;
    return JSON.parse(await r.text()) as unknown;
  } catch {
    return undefined;
  }
}

const record = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

/**
 * A game's summary and honours from BGG's `geekitems`, or null when it
 * didn't answer (an error, a timeout, or not the shape it has). The summary
 * is cleaned as a description is and capped at 300 characters.
 */
export async function fetchBggItem(
  bggId: number,
  fetchLike: FetchLike = fetch,
  budgetMs = 6000,
): Promise<BggItem | null> {
  const body = await siteJson(
    fetchLike,
    `${SITE}/geekitems?objectid=${bggId}&objecttype=thing&nosession=1`,
    Date.now() + budgetMs,
  );
  const item = record(record(body)?.item);
  if (!item) return null;
  const short = typeof item.short_description === 'string' ? cleanText(item.short_description, 300) : '';
  const links = record(item.links)?.boardgamehonor;
  const honours = (Array.isArray(links) ? links : [])
    .map((l: unknown) => record(l)?.name)
    .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
    .map((n) => parseHonour(decodeEntities(n)));
  const name = typeof item.name === 'string' && item.name.trim() ? decodeEntities(item.name.trim()) : undefined;
  return { ...(name ? { name } : {}), ...(short ? { summary: short } : {}), honours };
}

/**
 * A game's weight from BGG's `dynamicinfo`, for an id nobody looks up by
 * name (the collection's): a number, null when nobody has rated it, or
 * undefined when BGG didn't answer.
 */
export async function fetchBggWeight(
  bggId: number,
  fetchLike: FetchLike = fetch,
  budgetMs = 6000,
): Promise<number | null | undefined> {
  const body = await siteJson(
    fetchLike,
    `${SITE}/dynamicinfo?objectid=${bggId}&objecttype=thing`,
    Date.now() + budgetMs,
  );
  const stats = record(record(record(body)?.item)?.stats);
  if (!stats) return undefined;
  return weightOf(stats.avgweight, stats.numweights);
}

/** BGG's XML API, which needs a registered token. */
const XML_API = 'https://boardgamegeek.com/xmlapi2';

/** A name as BGG's spelling is compared with a typed one: case, spacing and punctuation aside. */
export const normName = (s: string) =>
  decodeEntities(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * BGG's spelling of `typed`: the name of an exact-search hit that differs
 * from it only in case, spacing and punctuation ("Spirit Island" for
 * "spirit island"), or null when there's none, or no token, or BGG didn't
 * answer within `budgetMs`. One search, no thing lookup: a suggestion
 * waits on it, so it must be quick, and never fails because of it.
 */
export async function bggSpelling(
  typed: string,
  token: string | undefined,
  fetchLike: FetchLike = fetch,
  budgetMs = 3000,
): Promise<string | null> {
  if (!token) return null;
  const target = normName(typed);
  if (!target) return null;
  const url = `${XML_API}/search?type=boardgame,boardgameexpansion&exact=1&query=${encodeURIComponent(typed)}`;
  let r: Awaited<ReturnType<FetchLike>>;
  try {
    r = await fetchLike(url, { signal: AbortSignal.timeout(budgetMs), headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200) return null;
    const names = [...(await r.text()).matchAll(/<name\b[^>]*\bvalue="([^"]*)"/g)].map((m) => decodeEntities(m[1]));
    return names.find((n) => normName(n) === target) ?? null;
  } catch {
    return null;
  }
}
