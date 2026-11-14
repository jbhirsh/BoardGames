import type { Award, Game, KeywordId, SubGame, WishlistItem, WishlistSection } from '../data/types';
import { KW, WISHLIST_TYPES } from '../data/keywords';
import { shortDesc } from './shortDesc';

/**
 * What BoardGameGeek says about a game, by its BGG id, as the games query
 * answers it (Query.games's `bgg`): the collection's games and the
 * wishlist's alike take their difficulty, awards and summary from here.
 */
export interface BggEntry {
  bggId: number;
  summary?: string | null;
  weight?: number | null;
  honours: ReadonlyArray<{ name: string; year?: number | null; result: string }>;
}

/** A wishlist game as the games query answers it (Query.games's `wishlist`). */
export interface ListedGame {
  id: string;
  name: string;
  source: 'CURATED' | 'FRIEND' | 'OWNER';
  suggestedBy?: string | null;
  note: string;
  players?: string | null;
  minPlayers: number;
  maxPlayers: number;
  dur?: string | null;
  minutes: number;
  description: string;
  keywords: readonly string[];
  section?: string | null;
  expands?: string | null;
  video?: string | null;
  image?: string | null;
  bggId?: number | null;
}

export type BggIndex = ReadonlyMap<number, BggEntry>;

/** The query's `bgg` rows by id. */
export const indexBgg = (rows: readonly BggEntry[]): BggIndex => new Map(rows.map((r) => [r.bggId, r]));

const awardsOf = (entry: BggEntry | undefined): Award[] =>
  (entry?.honours ?? []).map((h) => ({ name: h.name, ...(h.year == null ? {} : { year: h.year }), result: h.result }));

const isSection = (v: unknown): v is WishlistSection =>
  typeof v === 'string' && v !== 'suggested' && v in WISHLIST_TYPES;

/**
 * A game or a game inside one with what BoardGameGeek says about its id:
 * its weight and awards, and, for a game the owner picked (`bggSummary`),
 * BGG's summary in place of its own line. Anything BGG hasn't got leaves
 * the game as it is.
 */
function withBggInfo<T extends Game | SubGame>(game: T, info: BggIndex): T {
  const entry = game.bgg === undefined ? undefined : info.get(game.bgg);
  if (!entry) return game;
  const picked = 'bggSummary' in game && game.bggSummary && entry.summary;
  return {
    ...game,
    ...(entry.weight == null ? {} : { weight: entry.weight }),
    awards: awardsOf(entry),
    ...(picked ? { short: entry.summary } : {}),
  };
}

/**
 * What of a collection game still waits for the games query on a first
 * visit (`loaded` false): its difficulty when it or a game inside it has a
 * BGG id (a deck's spans its games'), its award count when it has one
 * itself (a game inside one shows its own), and its line when the owner
 * picked BGG's summary for it. Each shows as a grey bar until then; once the query has answered
 * (or failed), what it brought, or the game's own, shows instead.
 */
export function waitingForBgg(
  game: Pick<Game, 'bgg' | 'subgames' | 'bggSummary'>,
  loaded: boolean,
): { bgg: boolean; awards: boolean; summary: boolean } {
  const bgg = !loaded && (game.bgg !== undefined || (game.subgames ?? []).some((s) => s.bgg !== undefined));
  const awards = !loaded && game.bgg !== undefined;
  return { bgg, awards, summary: awards && game.bggSummary === true };
}

/** The collection with BGG's data, its games inside games included. */
export function collectionWithBgg(games: readonly Game[], info: BggIndex): Game[] {
  return games.map((g) =>
    withBggInfo(g.subgames ? { ...g, subgames: g.subgames.map((s) => withBggInfo(s, info)) } : g, info),
  );
}

const SOURCES = { CURATED: 'curated', FRIEND: 'friend', OWNER: 'owner' } as const;

/**
 * A wishlist game as the cards and rows take it. Its line is BGG's summary,
 * else the description's first sentence; a friend's note follows the
 * description, quoted. Unknown details match every filter rather than none:
 * min 1, max 99, mins 0 (which the duration filter treats as "any"), no
 * keywords.
 */
export function toWishlistItem(g: ListedGame, info: BggIndex): WishlistItem {
  const entry = g.bggId == null ? undefined : info.get(g.bggId);
  const source = SOURCES[g.source];
  const credit = g.note ? `“${g.note}”` : '';
  const blurb = g.description;
  const desc =
    [blurb, credit].filter(Boolean).join(' ') || (source === 'owner' ? 'Added by the owner.' : 'No description yet.');
  return {
    id: g.id,
    name: g.name,
    desc,
    blurb,
    short: entry?.summary || shortDesc(desc),
    yt: g.video ?? `how to play ${g.name} board game`,
    players: g.players ?? '',
    min: g.minPlayers,
    max: g.maxPlayers,
    mins: g.minutes,
    dur: g.dur ?? '',
    kw: g.keywords.filter((k): k is KeywordId => k in KW),
    type: isSection(g.section) ? g.section : 'suggested',
    awards: awardsOf(entry),
    source,
    ...(g.bggId == null ? {} : { bgg: g.bggId }),
    ...(entry?.weight == null ? {} : { weight: entry.weight }),
    ...(g.suggestedBy ? { suggestedBy: g.suggestedBy } : {}),
    ...(g.expands ? { expands: g.expands } : {}),
    ...(g.image ? { img: g.image } : {}),
  };
}
