// The one-time copy into the database (#290's part 2b): the wishlist's
// written entries, every stored suggestion and every vote from Upstash
// Redis, and BoardGameGeek's data for every game the site knows. Vercel's
// build runs it after db:migrate (vercel.json's buildCommand), once per
// database, and a follow-up PR deletes it once production's build log
// shows it ran.
//
//   npm run db:copy              the development database (DEV_DB_PATH)
//
// - Its inputs are committed (data/seed.json), as this PR deletes their
//   sources: the 39 entries src/data/wishlist.ts held, every hand-written
//   award win, which editions take another's honours, and the collection's
//   BGG ids. Redis is read over Upstash's REST API with fetch
//   (KV_REST_API_URL, KV_REST_API_TOKEN), so no Redis package is needed.
// - Fetch first, then write once: Redis and BoardGameGeek are read first
//   (geekitems and dynamicinfo at a gentle pace, and BGG's search for the
//   spelling of a waiting suggestion, with BGG_API_TOKEN), then everything
//   goes in one batch, whose first statement inserts the marker with a plain
//   INSERT, so two builds at once can't both copy. A remote interactive
//   transaction would time out over minutes of fetching.
// - The marker is versioned (`redis-copied` = COPY_VERSION). On production
//   any marker stops it. On the shared preview database a new version
//   empties the copied tables and copies again, so the copy can be retested
//   from a later push.
// - A failed copy fails the build, so production never goes live with an
//   empty wishlist; production without Redis's settings fails too. A BGG
//   miss doesn't count: its row is kept empty, oldest, for the next build's
//   refresh (bgg-refresh.ts) to fill.
// - Approved suggestions become `games` rows, filed as the owner filed
//   them; one that duplicates a written entry merges into it, votes and all.
//   Stored names take BGG's spelling where it differs only in case,
//   spacing or punctuation; the written entries' names are the owner's and
//   stay. A hand-written win BGG lists too (the same body, a year either
//   way, a Winner) is left to BGG's honours; the rest are kept as
//   owner_awards, printed for the PR, with the ids that have no honours.
//
// Imports only what Node loads as it stands (the schema, the connection, BGG's
// site module); the rows are held to the tables' own constraints.

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { open, recordedEnvironment, type Env } from '../api/_db/connection.ts';
import { checkEnvironment } from '../api/_db/environment.ts';
import { bggInfo, games, meta, ownerAwards, suggestions, votes } from '../api/_db/schema.ts';
import {
  bggSpelling,
  fetchBggItem,
  fetchBggWeight,
  normName,
  type BggItem,
  type FetchLike,
  type Honour,
} from '../api/_lib/bggSite.ts';
import { deployTarget } from './db-migrate.ts';

/** The copy's version: a preview database with an older one is emptied and copied again. */
export const COPY_VERSION = 'v2';
export const MARKER_KEY = 'redis-copied';

type GameRow = typeof games.$inferInsert;
type SuggestionRow = typeof suggestions.$inferInsert;
type Status = SuggestionRow['status'];

/** data/seed.json. */
export interface Seed {
  wishlist: GameRow[];
  awards: Record<string, Array<{ name: string; year: number }>>;
  honoursFrom: Record<string, number>;
  collection: number[];
}

/** A suggestion as Redis held it: a hash of strings. */
export type StoredHash = Record<string, string>;

/** What Redis holds that the copy reads. */
export interface RedisData {
  suggestions: StoredHash[];
  /** Each entry's voters, by entry id. */
  votes: Record<string, string[]>;
}

/** What BGG says about one id: geekitems' answer (null when it didn't answer) and the weight. */
export interface Fetched {
  item: BggItem | null;
  weight: number | null | undefined;
}

// ── Redis, over Upstash's REST API ───────────────────────────────────────

type Command = (args: string[]) => Promise<unknown>;

/** One Redis command over Upstash's REST API. */
export function upstash(url: string, token: string, fetchLike: typeof fetch = fetch): Command {
  return async (args) => {
    const r = await fetchLike(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Upstash answered ${r.status} to ${args[0]}`);
    const body = (await r.json()) as { result?: unknown; error?: string };
    if (body.error) throw new Error(`Upstash: ${body.error}`);
    return body.result;
  };
}

/** Every key matching `pattern`, by SCAN. */
async function scanKeys(redis: Command, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = (await redis(['SCAN', cursor, 'MATCH', pattern, 'COUNT', '500'])) as [string, string[]];
    keys.push(...batch);
    cursor = next;
  } while (cursor !== '0');
  return [...new Set(keys)].sort();
}

const fields = (flat: unknown): StoredHash => {
  const out: StoredHash = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = String(flat[i + 1]);
  return out;
};

/** Every stored suggestion, whatever its status, and every entry's voters. */
export async function readRedis(redis: Command): Promise<RedisData> {
  const suggestionKeys = await scanKeys(redis, 'suggestions:sug-*');
  const stored = [];
  for (const key of suggestionKeys) stored.push(fields(await redis(['HGETALL', key])));
  const voteKeys = await scanKeys(redis, 'wishlist:votes:*');
  const votesByEntry: Record<string, string[]> = {};
  for (const key of voteKeys) {
    votesByEntry[key.slice('wishlist:votes:'.length)] = ((await redis(['SMEMBERS', key])) as string[]).sort();
  }
  return { suggestions: stored.filter((s) => s.id && s.game), votes: votesByEntry };
}

// ── What the copy writes, worked out from what it read ───────────────────

interface Details {
  bggId?: number;
  year?: number;
  min?: number;
  max?: number;
  mins?: number;
  desc?: string;
  kw?: string[];
  type?: string;
  img?: string;
}

function details(raw: string | undefined): Details {
  if (!raw) return {};
  try {
    const d: unknown = JSON.parse(raw);
    return d && typeof d === 'object' ? (d as Details) : {};
  } catch {
    return {};
  }
}

const STATUSES: readonly Status[] = ['pending', 'approved', 'denied', 'unsent', 'removed'];
const SECTIONS = ['party', 'strategy', 'coop', 'two-player', 'heavy'];

const playersLabel = (min: number, max: number) => (max >= 99 ? `${min}+` : min === max ? `${min}` : `${min}–${max}`);

/** The known award bodies, by a pattern their names match; any other is named by its first two words. */
const BODIES: Array<[string, RegExp]> = [
  ['sdj', /spiel des jahres|kennerspiel|kinderspiel/],
  ['dsp', /deutscher spiele ?preis/],
  ['asdor', /as d.or/],
  ['goldengeek', /golden geek/],
  ['dicetower', /dice tower/],
  ['mensa', /mensa/],
  ['origins', /origins/],
  ['iga', /international gamers/],
  ['ukge', /uk games expo/],
  ['guldbrikken', /guldbrikken/],
  ['nsp', /nederlandse spellenprijs/],
  ['japan', /japan boardgame/],
  ['palme', /palme d.or/],
  ['mind', /mind.?spielepreis/],
  ['cardboard', /cardboard republic/],
  ['bgq', /board game quest/],
  ['att', /american tabletop/],
];

export function bodyOf(name: string): string {
  const n = name.toLowerCase();
  return BODIES.find(([, re]) => re.test(n))?.[0] ?? n.split(/\s+/).slice(0, 2).join(' ');
}

/** Whether BGG lists a hand-written win: a Winner from the same body within a year of it. */
export function bggHasWin(award: { name: string; year: number }, honours: readonly Honour[]): boolean {
  const body = bodyOf(award.name);
  return honours.some(
    (h) => h.result === 'Winner' && h.year !== null && Math.abs(h.year - award.year) <= 1 && bodyOf(h.name) === body,
  );
}

export interface Plan {
  games: GameRow[];
  suggestions: SuggestionRow[];
  votes: Array<{ gameId: string; anonId: string }>;
  info: Array<typeof bggInfo.$inferInsert>;
  awards: Array<typeof ownerAwards.$inferInsert>;
  /** What the log prints: renamed stored names, merged duplicates, votes left out, awards kept, ids without honours. */
  report: string[];
}

/**
 * The rows to write: the seed's entries, the stored suggestions and their
 * games, the votes, BGG's data by id, and the owner's awards BGG lacks.
 * `bgg` is what BGG answered, by id; `spelt` BGG's spelling of a waiting
 * suggestion's name, where it has one. Pure, so tests drive it.
 */
export function plan(
  seed: Seed,
  redis: RedisData,
  bgg: ReadonlyMap<number, Fetched>,
  spelt: ReadonlyMap<string, string>,
  at: number,
): Plan {
  const report: string[] = [];
  const rows: GameRow[] = seed.wishlist.map((g) => ({ ...g }));
  const byName = new Map(rows.map((g) => [normName(g.name), g.id]));
  /** Where an id's votes go: its own row, or the entry it merged into. */
  const voteTarget = new Map(rows.map((g) => [g.id, g.id]));
  const suggestionRows: SuggestionRow[] = [];

  const spelling = (name: string, bggId: number | undefined): string => {
    const theirs = (bggId !== undefined ? bgg.get(bggId)?.item?.name : undefined) ?? spelt.get(name);
    if (theirs && theirs !== name && normName(theirs) === normName(name)) {
      report.push(`renamed: “${name}” → “${theirs}” (BoardGameGeek's spelling)`);
      return theirs;
    }
    return name;
  };

  for (const s of [...redis.suggestions].sort((a, b) => Number(a.createdAt) - Number(b.createdAt))) {
    const d = details(s.details);
    const status = STATUSES.includes(s.status as Status) ? (s.status as Status) : 'pending';
    const source = s.source === 'owner' ? 'owner' : 'friend';
    const name = spelling(s.game, d.bggId);
    const createdAt = Number(s.createdAt) || 0;
    const decidedAt = s.decidedAt !== undefined ? Math.max(Number(s.decidedAt) || createdAt, createdAt) : null;
    let gameId: string | null = null;
    if (status === 'approved' || status === 'removed') {
      const dup = byName.get(normName(name));
      if (dup && status === 'approved') {
        report.push(`merged: ${s.id} (“${s.game}”) into ${dup}, votes included`);
        voteTarget.set(s.id, dup);
        gameId = dup;
      } else {
        const min = d.min ?? 1;
        const max = d.max ?? 99;
        const mins = d.mins ?? 0;
        const known = d.min !== undefined;
        rows.push({
          id: s.id,
          name,
          status: status === 'approved' ? 'wanted' : 'removed',
          source,
          suggestedBy: source === 'friend' ? s.name : null,
          players: known ? playersLabel(min, max) : null,
          minPlayers: min,
          maxPlayers: max,
          dur: known && mins > 0 ? `${mins} min` : null,
          minutes: mins,
          description: d.desc ?? '',
          keywords: d.kw ?? [],
          section: d.type && SECTIONS.includes(d.type) ? d.type : null,
          image: d.img ?? null,
          bggId: d.bggId ?? null,
          year: d.year ?? null,
          createdAt: decidedAt ?? createdAt,
        });
        if (status === 'approved') {
          byName.set(normName(name), s.id);
          voteTarget.set(s.id, s.id);
        }
        gameId = s.id;
      }
    }
    suggestionRows.push({
      id: s.id,
      gameName: name,
      name: s.name,
      note: s.note ?? '',
      status,
      source,
      gameId,
      createdAt,
      decidedAt,
    });
  }

  const voteRows: Plan['votes'] = [];
  const seen = new Set<string>();
  for (const [id, voters] of Object.entries(redis.votes)) {
    const target = voteTarget.get(id);
    if (!target) {
      if (voters.length) report.push(`votes left out: ${voters.length} for ${id}, which is on no list`);
      continue;
    }
    for (const anonId of voters) {
      const key = `${target}\u0000${anonId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      voteRows.push({ gameId: target, anonId });
    }
  }

  const info: Plan['info'] = [];
  for (const [bggId, fetched] of [...bgg].sort((a, b) => a[0] - b[0])) {
    const named = rows.find((g) => g.bggId === bggId)?.name;
    info.push({
      bggId,
      name: fetched.item?.name ?? named ?? `BoardGameGeek ${bggId}`,
      summary: fetched.item?.summary ?? null,
      honours: fetched.item?.honours ?? [],
      weight: fetched.weight ?? null,
      honoursFrom: seed.honoursFrom[String(bggId)] ?? null,
      fetchedAt: fetched.item ? at : 0,
    });
  }

  const honoursOf = (bggId: number) => {
    const from = seed.honoursFrom[String(bggId)] ?? bggId;
    return bgg.get(from)?.item?.honours;
  };
  const awards: Plan['awards'] = [];
  for (const [id, wins] of Object.entries(seed.awards)) {
    const bggId = Number(id);
    const honours = honoursOf(bggId);
    if (honours !== undefined && honours.length === 0) report.push(`no honours on BoardGameGeek: ${bggId}`);
    for (const win of wins) {
      if (honours && bggHasWin(win, honours)) continue;
      awards.push({ bggId, name: win.name, year: win.year });
      report.push(
        `kept as the owner's: ${bggId} ${win.name}, ${win.year}${honours ? '' : ' (BoardGameGeek did not answer)'}`,
      );
    }
  }
  const unique = new Map(awards.map((a) => [`${a.bggId}|${a.name}|${a.year}`, a]));
  return { games: rows, suggestions: suggestionRows, votes: voteRows, info, awards: [...unique.values()], report };
}

// ── Running it ───────────────────────────────────────────────────────────

/** Every BGG id the copy fetches: the collection's, the entries', the stored ones' and the editions they borrow from. */
export function bggIds(seed: Seed, redis: RedisData): number[] {
  const ids = new Set<number>([...seed.collection, ...Object.values(seed.honoursFrom)]);
  for (const g of seed.wishlist) if (g.bggId) ids.add(g.bggId);
  for (const s of redis.suggestions) {
    const id = details(s.details).bggId;
    if (id) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

export interface CopyDeps {
  fetch?: FetchLike & typeof fetch;
  pause?: () => Promise<unknown>;
  now?: () => number;
  log?: (line: string) => void;
}

const COPIED = [votes, ownerAwards, bggInfo, suggestions, games] as const;

/** Whether this database still needs the copy, emptying a preview's older one first. */
async function marker(db: LibSQLDatabase): Promise<string | undefined> {
  const [row] = await db.select().from(meta).where(eq(meta.key, MARKER_KEY));
  return row?.value;
}

export async function copy(env: Env, arg: string | undefined, deps: CopyDeps = {}): Promise<string> {
  const log = deps.log ?? console.log;
  const request = deps.fetch ?? fetch;
  const pause = deps.pause ?? (() => new Promise((resolve) => setTimeout(resolve, 500)));
  const { expected, conn } = deployTarget(env, arg, 'copies into');
  const { db, client } = open(conn);
  try {
    checkEnvironment(await recordedEnvironment(db), expected);
    const done = await marker(db);
    if (done && (expected !== 'preview' || done === COPY_VERSION)) return `db:copy: already copied (${done}).`;

    const seed = JSON.parse(await readFile(new URL('../data/seed.json', import.meta.url), 'utf8')) as Seed;
    let redisData: RedisData = { suggestions: [], votes: {} };
    if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
      redisData = await readRedis(upstash(env.KV_REST_API_URL, env.KV_REST_API_TOKEN, request));
    } else if (expected === 'production') {
      throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN must be set to copy production from Redis');
    } else {
      log('db:copy: no Redis settings; copying the seed alone.');
    }

    const fetched = new Map<number, Fetched>();
    for (const id of bggIds(seed, redisData)) {
      fetched.set(id, { item: await fetchBggItem(id, request), weight: await fetchBggWeight(id, request) });
      await pause();
    }
    const spelt = new Map<string, string>();
    for (const s of redisData.suggestions) {
      if (details(s.details).bggId || spelt.has(s.game)) continue;
      const theirs = await bggSpelling(s.game, env.BGG_API_TOKEN, request);
      if (theirs) spelt.set(s.game, theirs);
      await pause();
    }

    const p = plan(seed, redisData, fetched, spelt, (deps.now ?? Date.now)());
    const empty = done ? COPIED.map((t) => db.delete(t).where(sql`1 = 1`)) : [];
    const claim = done
      ? db.update(meta).set({ value: COPY_VERSION }).where(eq(meta.key, MARKER_KEY))
      : db.insert(meta).values({ key: MARKER_KEY, value: COPY_VERSION });
    const writes = [
      ...(p.games.length ? [db.insert(games).values(p.games)] : []),
      ...(p.suggestions.length ? [db.insert(suggestions).values(p.suggestions)] : []),
      ...(p.votes.length ? [db.insert(votes).values(p.votes)] : []),
      ...(p.info.length ? [db.insert(bggInfo).values(p.info)] : []),
      ...(p.awards.length ? [db.insert(ownerAwards).values(p.awards)] : []),
    ];
    await db.batch([claim, ...empty, ...writes]);
    for (const line of p.report) log(`db:copy: ${line}`);
    const wanted = p.games.filter((g) => g.status === 'wanted').length;
    return `db:copy: copied ${wanted} games, ${p.suggestions.length} suggestions, ${p.votes.length} votes, ${p.info.length} BoardGameGeek rows and ${p.awards.length} owner's awards (${COPY_VERSION}).`;
  } finally {
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await copy(process.env, process.argv[2]));
}
