// BoardGameGeek XML API 2 lookup used to fill in a suggested game's details
// when the owner approves it. No API key; the XML is small enough to read
// with a few targeted regexes rather than a parser dependency.

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
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;

const BASE = 'https://boardgamegeek.com/xmlapi2';

// BGG double-encodes the description (`&amp;mdash;` in the XML means the
// text holds `&mdash;`), so decoding runs twice.
function decodeEntities(s: string): string {
  return decodeOnce(decodeOnce(s));
}

const codePoint = (n: number, raw: string) => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : raw);

function decodeOnce(s: string): string {
  return s
    .replace(/&#(\d+);/g, (raw, n) => codePoint(Number(n), raw))
    .replace(/&#x([0-9a-f]+);/gi, (raw, h) => codePoint(parseInt(h, 16), raw))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

// Anchored on whitespace so `name=` never matches inside `friendlyname=`.
const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1];

/** The first two sentences of BGG's often-long description, capped at `max` characters. */
export function summarise(raw: string, max = 240): string {
  const text = decodeEntities(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  // Split after sentence punctuation followed by whitespace, so decimals
  // like "2.0" stay whole and a trailing unpunctuated sentence is kept.
  const sentences = text.split(/(?<=[.!?])\s+/);
  let out = sentences.slice(0, 2).join(' ').trim();
  if (out.length > max) out = out.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return out;
}

// BGG label -> app keyword id. Ranks come from <rank name="…">, categories and
// mechanics from <link type="boardgamecategory|boardgamemechanic" value="…">.
const RANK_KW: Record<string, string> = {
  strategygames: 'strategy', familygames: 'family', partygames: 'party', thematic: 'thematic',
  abstracts: 'abstract', cgs: 'card-game', childrensgames: 'family',
};
const LINK_KW: Record<string, string> = {
  'Party Game': 'party', 'Card Game': 'card-game', 'Word Game': 'word', 'Bluffing': 'bluffing',
  'Deduction': 'deduction', 'Negotiation': 'negotiation', 'Abstract Strategy': 'abstract',
  'Action / Dexterity': 'active', 'Mature / Adult': 'adult', "Children's Game": 'family',
  'Cooperative Game': 'cooperative', 'Team-Based Game': 'team', 'Deck, Bag, and Pool Building': 'deck-building',
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
  const min = num('minplayers') || 1;
  const max = Math.max(min, num('maxplayers') || min);
  const playing = num('playingtime') || num('maxplaytime') || num('minplaytime') || 0;
  const year = num('yearpublished') || undefined;
  const descRaw = /<description>([\s\S]*?)<\/description>/.exec(xml)?.[1] ?? '';

  const kw = new Set<string>();
  for (const tag of xml.match(/<rank\b[^>]*>/g) ?? []) {
    const name = attr(tag, 'name');
    const value = attr(tag, 'value');
    if (name && RANK_KW[name] && value && value !== 'Not Ranked') kw.add(RANK_KW[name]);
  }
  for (const tag of xml.match(/<link\b[^>]*>/g) ?? []) {
    const type = attr(tag, 'type');
    const value = attr(tag, 'value');
    if (!value || (type !== 'boardgamecategory' && type !== 'boardgamemechanic')) continue;
    const mapped: string | undefined = LINK_KW[decodeEntities(value)];
    if (mapped) kw.add(mapped);
  }
  if (playing > 0 && playing <= 15) kw.add('quick-play');

  return {
    bggId: Number(idMatch[1]),
    name: primary ? decodeEntities(primary) : '',
    year,
    min,
    max,
    mins: playing,
    desc: summarise(descRaw),
    kw: [...kw],
  };
}

const norm = (s: string) => decodeEntities(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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

/** One GET within the overall deadline. BGG answers 202 while it queues a request; one short retry covers it. */
async function get(fetchLike: FetchLike, url: string, deadline: number): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const r = await fetchLike(url, { signal: AbortSignal.timeout(remaining) });
    if (r.status === 200) return r.text();
    if (r.status !== 202 || deadline - Date.now() <= RETRY_MS) return null;
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
  return null;
}

/**
 * Look a game up by name within `budgetMs` overall (the caller runs inside a
 * serverless function with its own limit). Returns null when BGG has no
 * confident match, errors, or runs out of time.
 */
export async function lookupGame(name: string, fetchLike: FetchLike = fetch, budgetMs = 6000): Promise<GameDetails | null> {
  const deadline = Date.now() + budgetMs;
  const q = encodeURIComponent(name);
  const exact = await get(fetchLike, `${BASE}/search?type=boardgame,boardgameexpansion&exact=1&query=${q}`, deadline);
  let id = exact ? pickSearchId(exact, name) : null;
  if (id === null) {
    const loose = await get(fetchLike, `${BASE}/search?type=boardgame,boardgameexpansion&query=${q}`, deadline);
    id = loose ? pickSearchId(loose, name) : null;
  }
  if (id === null) return null;
  const thing = await get(fetchLike, `${BASE}/thing?id=${id}&stats=1`, deadline);
  return thing ? parseThing(thing) : null;
}
