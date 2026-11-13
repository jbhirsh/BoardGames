// Keeps `bgg_info` (api/_db/schema.ts) current: in a production build, after
// the migrations and the one-time copy (vercel.json's buildCommand), it
// fills the row of any BGG id the site knows but the table lacks (a game
// new in src/data/games.ts, a wishlist game BGG didn't answer for), then
// refreshes the oldest rows past REFRESH_AFTER_MS, at most PER_BUILD in all
// (about 20 s at BGG's gentle pace). Rows the copy fetched in the same
// build are fresh, so it leaves them. It never fails the build: a miss is
// logged and tried again by the next one. Previews (a PR's, Dependabot's)
// never run it, so they add nothing to BGG's load; nor does a production
// build of any branch but main.
//
//   npm run bgg-refresh          the development database (DEV_DB_PATH)
//
// A weekly workflow would need a Turso token in GitHub, which #290 ruled out.
//
// Imports only what Node loads as it stands (the schema, the connection,
// BGG's site module).

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { asc, eq, ne } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { open, recordedEnvironment, type Env } from '../api/_db/connection.ts';
import { checkEnvironment } from '../api/_db/environment.ts';
import { bggInfo, games, ownerAwards } from '../api/_db/schema.ts';
import { fetchBggItem, fetchBggWeight, type FetchLike } from '../api/_lib/bggSite.ts';
import { deployTarget } from './db-migrate.ts';

/** How many ids one build asks BGG about at most. */
export const PER_BUILD = 10;
/** How old a row may get before a build refreshes it. */
export const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** Every BGG id in src/data/games.ts's source, the games inside games included. */
export const collectionIds = (source: string): number[] =>
  [...new Set([...source.matchAll(/\bbgg:\s*(\d+)/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);

/**
 * The ids to ask about this build: those with no row first, then the
 * oldest rows past REFRESH_AFTER_MS, PER_BUILD in all. A row BGG didn't
 * answer for is moved back a day, so it's tried again tomorrow.
 */
export function due(
  known: readonly number[],
  rows: ReadonlyArray<{ bggId: number; fetchedAt: number }>,
  now: number,
): number[] {
  const have = new Set(rows.map((r) => r.bggId));
  const missing = known.filter((id) => !have.has(id));
  const stale = [...rows]
    .filter((r) => now - r.fetchedAt > REFRESH_AFTER_MS)
    .sort((a, b) => a.fetchedAt - b.fetchedAt)
    .map((r) => r.bggId);
  return [...missing, ...stale].slice(0, PER_BUILD);
}

export interface RefreshDeps {
  fetch?: FetchLike;
  pause?: () => Promise<unknown>;
  now?: () => number;
  log?: (line: string) => void;
  /** src/data/games.ts's source. */
  collection?: () => Promise<string>;
}

/** How long a row BGG didn't answer for waits before it's asked again: a day, so it can't hold up the rest. */
const RETRY_MISS_MS = 24 * 60 * 60 * 1000;

async function refreshOne(db: LibSQLDatabase, bggId: number, request: FetchLike, at: number): Promise<boolean> {
  const item = await fetchBggItem(bggId, request);
  const [listed] = await db.select({ name: games.name }).from(games).where(eq(games.bggId, bggId));
  const name = listed?.name ?? `BoardGameGeek ${bggId}`;
  if (!item) {
    // To the back of the queue, retried in a day: ids BGG never answers for
    // (merged, deleted) would otherwise take every build's turns. An id with
    // no row yet gets an empty one (no summary, weight or honours), dated
    // the same way, so it joins the stale rows' rotation instead of heading
    // the missing ones every build.
    const retryAt = at - REFRESH_AFTER_MS + RETRY_MISS_MS;
    await db
      .insert(bggInfo)
      .values({ bggId, name, honours: [], fetchedAt: retryAt })
      .onConflictDoUpdate({ target: bggInfo.bggId, set: { fetchedAt: retryAt } });
    return false;
  }
  const weight = await fetchBggWeight(bggId, request);
  const row = {
    bggId,
    name: item.name ?? name,
    summary: item.summary ?? null,
    honours: item.honours,
    fetchedAt: at,
    ...(weight === undefined ? {} : { weight }),
  };
  await db.insert(bggInfo).values(row).onConflictDoUpdate({ target: bggInfo.bggId, set: row });
  return true;
}

/** Runs the refresh where it should, answering its log line; never throws. */
export async function refresh(env: Env, arg: string | undefined, deps: RefreshDeps = {}): Promise<string> {
  if (env.VERCEL && env.VERCEL_ENV !== 'production') return 'bgg-refresh: production builds only; skipped.';
  const log = deps.log ?? console.log;
  const request = deps.fetch ?? fetch;
  const pause = deps.pause ?? (() => new Promise((resolve) => setTimeout(resolve, 1000)));
  const now = (deps.now ?? Date.now)();
  try {
    const { expected, conn } = deployTarget(env, arg, 'refreshes');
    const { db, client } = open(conn);
    try {
      checkEnvironment(await recordedEnvironment(db), expected);
      const source = await (
        deps.collection ?? (() => readFile(new URL('../src/data/games.ts', import.meta.url), 'utf8'))
      )();
      const listed = await db.select({ bggId: games.bggId }).from(games).where(ne(games.status, 'removed'));
      const rows = await db
        .select({ bggId: bggInfo.bggId, fetchedAt: bggInfo.fetchedAt, honoursFrom: bggInfo.honoursFrom })
        .from(bggInfo)
        .orderBy(asc(bggInfo.fetchedAt));
      // The editions that lend their honours, and the games with the
      // owner's own awards, need rows too, or what they hold isn't shown.
      const awarded = await db.select({ bggId: ownerAwards.bggId }).from(ownerAwards);
      const known = [
        ...new Set([
          ...collectionIds(source),
          ...listed.flatMap((g) => (g.bggId ? [g.bggId] : [])),
          ...rows.flatMap((r) => (r.honoursFrom ? [r.honoursFrom] : [])),
          ...awarded.map((a) => a.bggId),
        ]),
      ];
      const ids = due(known, rows, now);
      let refreshed = 0;
      for (const id of ids) {
        if (await refreshOne(db, id, request, now)) refreshed++;
        else log(`bgg-refresh: BoardGameGeek didn't answer for ${id}; the next build tries again.`);
        await pause();
      }
      return `bgg-refresh: refreshed ${refreshed} of ${ids.length}.`;
    } finally {
      client.close();
    }
  } catch (err) {
    return `bgg-refresh: skipped (${err instanceof Error ? err.message : String(err)}); the build goes on.`;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await refresh(process.env, process.argv[2]));
}
