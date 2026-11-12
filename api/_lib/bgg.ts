// BoardGameGeek, for a game's details when the owner approves or adds it.
//
// - The search and the `thing` lookup are BGG's documented XML API 2, which
//   needs a registered token (sent as a bearer header); the XML is small
//   enough to read with a few targeted regexes rather than a parser
//   dependency. `thing` with stats gives players, time, the description,
//   the weight, and the categories and mechanics the keywords and the
//   section (section.ts) come from.
// - The site's own JSON endpoints answer by id with no token, for what the
//   XML API lacks: `geekitems` has the one-line summary BGG writes for each
//   game (`short_description`) and its honours (`links.boardgamehonor`),
//   `dynamicinfo` the weight of a game nobody looks up by name (the
//   collection's). They're undocumented, so a failure there never costs a
//   lookup: the game is still found, and the summary and honours wait for
//   the next refresh (scripts/bgg-refresh.ts).

import { inferSection } from './section.js';
import { DESC_MAX, MINS_MAX, PLAYERS_MAX, type WishlistSection } from './limits.js';

export interface GameDetails {
  bggId: number;
  name: string;
  year?: number;
  min: number;
  max: number;
  /** Typical playing time in minutes (BGG's playingtime, else the max of the range). */
  mins: number;
  /** Short plain-text description, first couple of sentences. */
  desc: string;
  /** Keyword ids the app knows, derived from BGG ranks, categories and mechanics. */
  kw: string[];
  /** Box-art thumbnail URL on BGG's image CDN, when the entry has one. */
  img?: string;
  /** The community's weight, 1 (light) to 5 (heavy), when anyone has rated it. */
  weight?: number;
  /** BGG's categories and mechanics as it names them, which the section rule reads. */
  categories: string[];
  mechanics: string[];
  /** The wishlist section its players, weight, categories and mechanics put it under (section.ts). */
  section: WishlistSection;
  /** BGG's one-line summary (geekitems), when it has one and answered. */
  summary?: string;
  /** Its honours (geekitems), absent when that didn't answer. */
  honours?: Honour[];
}

/**
 * Box art an entry can show: BGG's image CDN only. The lookup keeps no
 * other thumbnail, and details the owner sends back are held to it, so the
 * site and the emailed pages never load an image from anywhere else.
 */
export const BGG_IMG_RE = /^https:\/\/cf\.geekdo-images\.com\/\S+$/;

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ status: number; text(): Promise<string> }>;

const BASE = 'https://boardgamegeek.com/xmlapi2';

// BGG double-encodes the description (`&amp;mdash;` in the XML means the
// text holds `&mdash;`), so decoding runs twice.
function decodeEntities(s: string): string {
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
const attr = (tag: string, name: string): string | undefined => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1];

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
export function cleanDescription(raw: string, max = DESC_MAX): string {
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

// BGG label -> app keyword id. Ranks come from <rank name="…">, categories and
// mechanics from <link type="boardgamecategory|boardgamemechanic" value="…">.
const RANK_KW: Record<string, string> = {
  strategygames: 'strategy',
  familygames: 'family',
  partygames: 'party',
  thematic: 'thematic',
  abstracts: 'abstract',
  cgs: 'card-game',
  childrensgames: 'family',
};
const LINK_KW: Record<string, string> = {
  'Party Game': 'party',
  'Card Game': 'card-game',
  'Word Game': 'word',
  Bluffing: 'bluffing',
  Deduction: 'deduction',
  Negotiation: 'negotiation',
  'Abstract Strategy': 'abstract',
  'Action / Dexterity': 'active',
  'Mature / Adult': 'adult',
  "Children's Game": 'family',
  'Cooperative Game': 'cooperative',
  'Team-Based Game': 'team',
  'Deck, Bag, and Pool Building': 'deck-building',
  'Real-Time': 'quick-play',
};

/** Parse a `/thing?id=…&stats=1` response into details. Exported for tests. */
export function parseThing(xml: string): GameDetails | null {
  const idMatch = /<item[^>]*\bid="(\d+)"/.exec(xml);
  if (!idMatch) return null;
  const primaryTag = xml.match(/<name\b[^>]*>/g)?.find((t) => attr(t, 'type') === 'primary');
  const primary = primaryTag ? attr(primaryTag, 'value') : undefined;
  const num = (tag: string) => {
    const m = new RegExp(`<${tag}[^>]*value="(\\d+)"`).exec(xml);
    return m ? Number(m[1]) : undefined;
  };
  // BGG writes value="0" for fields it doesn't know, so 0 means unset.
  // It also lists some party games for 999 players and some campaigns at
  // 720 minutes or more, past what an entry holds, so those are capped.
  const lo = num('minplayers') || 1;
  const max = Math.min(PLAYERS_MAX, Math.max(lo, num('maxplayers') || lo));
  const min = Math.min(lo, max);
  const playing = Math.min(MINS_MAX, num('playingtime') || num('maxplaytime') || num('minplaytime') || 0);
  const year = num('yearpublished') || undefined;
  const descRaw = /<description>([\s\S]*?)<\/description>/.exec(xml)?.[1] ?? '';
  const thumb = decodeEntities(/<thumbnail>\s*([^<]*?)\s*<\/thumbnail>/.exec(xml)?.[1] ?? '');
  const img = BGG_IMG_RE.test(thumb) ? thumb : undefined;

  const kw = new Set<string>();
  const categories: string[] = [];
  const mechanics: string[] = [];
  for (const tag of xml.match(/<rank\b[^>]*>/g) ?? []) {
    const name = attr(tag, 'name');
    const value = attr(tag, 'value');
    if (name && RANK_KW[name] && value && value !== 'Not Ranked') kw.add(RANK_KW[name]);
  }
  for (const tag of xml.match(/<link\b[^>]*>/g) ?? []) {
    const type = attr(tag, 'type');
    const value = attr(tag, 'value');
    if (!value || (type !== 'boardgamecategory' && type !== 'boardgamemechanic')) continue;
    const label = decodeEntities(value);
    (type === 'boardgamecategory' ? categories : mechanics).push(label);
    const mapped: string | undefined = LINK_KW[label];
    if (mapped) kw.add(mapped);
  }
  if (playing > 0 && playing <= 15) kw.add('quick-play');
  const weight = weightOf(
    /<averageweight\b[^>]*value="([^"]*)"/.exec(xml)?.[1],
    /<numweights\b[^>]*value="([^"]*)"/.exec(xml)?.[1],
  );

  return {
    bggId: Number(idMatch[1]),
    name: primary ? decodeEntities(primary) : '',
    year,
    min,
    max,
    mins: playing,
    desc: cleanDescription(descRaw),
    kw: [...kw],
    img,
    ...(weight === null ? {} : { weight }),
    categories,
    mechanics,
    section: inferSection({ max, weight: weight ?? undefined, categories, mechanics }),
  };
}

/**
 * A weight as BGG writes it (a decimal string, and how many rated it),
 * rounded to two places, or null when nobody has rated it or it's out of
 * BGG's 1 to 5.
 */
function weightOf(avg: unknown, votes: unknown): number | null {
  const weight = Number(avg);
  if (!(Number(votes) > 0) || !(weight >= 1 && weight <= 5)) return null;
  return Math.round(weight * 100) / 100;
}

const norm = (s: string) =>
  decodeEntities(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Pick the search hit whose name matches what was typed, ignoring case and
 * punctuation, and also accepting a match on the part before a colon
 * ("Ticket to Ride: Europe" for "ticket to ride europe"). No match means no
 * details: attributing another game's data would be worse than none.
 */
export function pickSearchId(xml: string, wanted: string): number | null {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/g) ?? [];
  const target = norm(wanted);
  if (!target) return null;
  const named = items.map((item) => {
    const name = /<name[^>]*value="([^"]*)"/.exec(item)?.[1] ?? '';
    return { id: Number(attr(item, 'id') ?? NaN), full: norm(name), beforeColon: norm(name.split(':')[0] ?? '') };
  });
  // A whole-name match anywhere in the list beats a before-the-colon match,
  // so "wingspan" resolves to Wingspan even when an expansion is listed first.
  const exact = named.find((n) => n.full === target);
  if (exact) return exact.id;
  const titled = named.find((n) => n.beforeColon === target && n.full.startsWith(target));
  return titled ? titled.id : null;
}

const RETRY_MS = 1500;

/**
 * Why a lookup came back the way it did, so the owner hears about a miss
 * instead of finding an empty card: `no-match` (BGG answered, nothing fits
 * the name), `no-token` (BGG_API_TOKEN unset, so BGG was never called),
 * `refused` (BGG answered 401 or 403 to the token) and `unavailable` (an
 * error status, a network failure, or 202s until the budget ran out).
 */
export type LookupResult =
  | { outcome: 'found'; details: GameDetails }
  | { outcome: 'no-match' }
  | { outcome: 'no-token' }
  | { outcome: 'refused'; status: number }
  | { outcome: 'unavailable'; cause?: unknown };

export type LookupOutcome = LookupResult['outcome'];

type Fetched =
  { ok: true; body: string } | { ok: false; result: Extract<LookupResult, { outcome: 'refused' | 'unavailable' }> };

/** One GET within the overall deadline. BGG answers 202 while it queues a request; one short retry covers it. */
async function get(fetchLike: FetchLike, url: string, deadline: number, token: string): Promise<Fetched> {
  const unavailable = (cause?: unknown): Fetched => ({
    ok: false,
    result: { outcome: 'unavailable', ...(cause === undefined ? {} : { cause }) },
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return unavailable();
    let r: Awaited<ReturnType<FetchLike>>;
    try {
      r = await fetchLike(url, {
        signal: AbortSignal.timeout(remaining),
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      // A network failure, or the timeout signal firing.
      return unavailable(err);
    }
    if (r.status === 200) return { ok: true, body: await r.text() };
    if (r.status === 401 || r.status === 403) return { ok: false, result: { outcome: 'refused', status: r.status } };
    if (r.status !== 202 || deadline - Date.now() <= RETRY_MS) return unavailable();
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
  return unavailable();
}

/**
 * Look a game up by name within `budgetMs` overall (the caller runs inside a
 * serverless function with its own limit), saying why when it finds
 * nothing. BGG answers 401 to a request without a token, so with none set
 * this returns `no-token` without calling it at all.
 */
export async function lookupGame(
  name: string,
  token: string | undefined,
  fetchLike: FetchLike = fetch,
  budgetMs = 6000,
): Promise<LookupResult> {
  if (!token) return { outcome: 'no-token' };
  const deadline = Date.now() + budgetMs;
  const q = encodeURIComponent(name);
  const exact = await get(
    fetchLike,
    `${BASE}/search?type=boardgame,boardgameexpansion&exact=1&query=${q}`,
    deadline,
    token,
  );
  if (!exact.ok && exact.result.outcome === 'refused') return exact.result;
  let id = exact.ok ? pickSearchId(exact.body, name) : null;
  if (id === null) {
    // The loose search also catches what a failed exact search would have,
    // so its answer decides between "no match" and "BGG didn't answer".
    const loose = await get(fetchLike, `${BASE}/search?type=boardgame,boardgameexpansion&query=${q}`, deadline, token);
    if (!loose.ok) return loose.result;
    id = pickSearchId(loose.body, name);
  }
  if (id === null) return { outcome: 'no-match' };
  // The summary and honours come from BGG's site API, alongside: a failure
  // there leaves them out, never the game.
  const [thing, item] = await Promise.all([
    get(fetchLike, `${BASE}/thing?id=${id}&stats=1`, deadline, token),
    fetchBggItem(id, fetchLike, deadline - Date.now()),
  ]);
  if (!thing.ok) return thing.result;
  const details = parseThing(thing.body);
  if (!details) return { outcome: 'no-match' };
  return {
    outcome: 'found',
    details: item ? { ...details, ...(item.summary ? { summary: item.summary } : {}), honours: item.honours } : details,
  };
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
  const short = typeof item.short_description === 'string' ? cleanDescription(item.short_description, 300) : '';
  const links = record(item.links)?.boardgamehonor;
  const honours = (Array.isArray(links) ? links : [])
    .map((l) => record(l)?.name)
    .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
    .map((n) => parseHonour(decodeEntities(n)));
  return { ...(short ? { summary: short } : {}), honours };
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
