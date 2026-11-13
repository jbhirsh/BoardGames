// BoardGameGeek, for a game's details when the owner approves or adds it.
//
// - The search and the `thing` lookup are BGG's documented XML API 2, which
//   needs a registered token (sent as a bearer header); the XML is small
//   enough to read with a few targeted regexes rather than a parser
//   dependency. `thing` with stats gives players, time, the description,
//   the weight, and the categories and mechanics the keywords and the
//   section (section.ts) come from.
// - BGG's site answers by id with no token for the summary and honours
//   (bggSite.ts, asked beside `thing`): a failure there never costs a
//   lookup: the game is still found, and the summary and honours wait for
//   the next refresh (scripts/bgg-refresh.ts).

import { inferSection } from './section.js';
import { DESC_MAX, MINS_MAX, PLAYERS_MAX, type WishlistSection } from './limits.js';
import {
  attr,
  cleanText,
  decodeEntities,
  fetchBggItem,
  normName,
  weightOf,
  type FetchLike,
  type Honour,
} from './bggSite.js';

export type { BggItem, FetchLike, Honour } from './bggSite.js';
export { bggSpelling, fetchBggItem, fetchBggWeight, parseHonour } from './bggSite.js';

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

/**
 * BGG's whole description as plain text: entities decoded, markup and
 * control characters gone, whitespace collapsed, and shortened to the whole
 * sentences that fit DESC_MAX.
 */
export const cleanDescription = (raw: string, max = DESC_MAX): string => cleanText(raw, max);

const BASE = 'https://boardgamegeek.com/xmlapi2';

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

const norm = normName;

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
