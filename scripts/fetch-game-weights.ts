// Fetch each game's difficulty from BoardGameGeek: the community's average
// weight (1 light to 5 heavy) for every game and game-inside-a-game in
// src/data/games.ts, and every entry in src/data/wishlist.ts, that carries a
// BGG id (`bgg`), written to the id -> weight map in src/data/gameWeights.ts
// that both merge in.
//
//   npm run game-weights
//
// The site's own endpoint answers by id without a token, as for the
// wishlist's box art (scripts/fetch-wishlist-art.ts). A game BGG has no
// weight votes for is kept as null, and shows no difficulty. A run cut
// short by a rate limit or an outage keeps the weights it had for the games
// it didn't reach; ids no longer in either file are dropped.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MAP_FILE = 'src/data/gameWeights.ts';
const STATS_URL = (bgg: number) => `https://api.geekdo.com/api/dynamicinfo?objectid=${bgg}&objecttype=thing`;

interface Stats {
  avgweight?: string;
  numweights?: string;
}

/** A game to fetch a weight for, by its BoardGameGeek id. */
export interface Game {
  name: string;
  bgg: number;
}

/** What a run reaches outside itself: the folder it reads and writes under, the network, and its pause. */
export interface Deps {
  dir?: string;
  fetch?: typeof fetch;
  pause?: () => Promise<unknown>;
}

/**
 * The games to fetch, from the sources of games.ts and wishlist.ts.
 *
 * The games are data literals; read them straight off the source rather
 * than importing it (its path-less imports are Vite's, not Node's), as
 * Prettier lays them out. Every game and game inside one has its name and
 * slug before its id, with no other name between; every wishlist entry its
 * id just before its name.
 */
export function readGames(gamesSource: string, wishlistSource: string): Game[] {
  const owned = [
    ...gamesSource.matchAll(/\bname: (['"])(.+?)\1,\s*slug: '[^']+',(?:(?!\bname: )[\s\S])*?\bbgg: (\d+),/g),
  ].map((m) => ({ name: m[2], bgg: Number(m[3]) }));
  if (owned.length === 0) throw new Error('no BoardGameGeek ids found in src/data/games.ts');
  const wanted = [...wishlistSource.matchAll(/\bbgg: (\d+),\s*name: (['"])(.+?)\2,/g)].map((m) => ({
    name: m[3],
    bgg: Number(m[1]),
  }));
  if (wanted.length === 0) throw new Error('no BoardGameGeek ids found in src/data/wishlist.ts');
  // An id in both is fetched once.
  return [...new Map([...owned, ...wanted].map((g) => [g.bgg, g])).values()];
}

/** What the last run fetched, read off the map it wrote, for the games this one doesn't reach. */
export function readPrevious(mapSource: string): Map<number, number | null> {
  const previous = new Map<number, number | null>();
  for (const m of mapSource.matchAll(/^\s*(\d+): ([\d.]+|null),/gm)) {
    previous.set(Number(m[1]), m[2] === 'null' ? null : Number(m[2]));
  }
  return previous;
}

/**
 * Each game's weight from BoardGameGeek, one at a time, paced; once BGG rate
 * limits or stalls, the rest keep their previous weight.
 */
export async function fetchWeights(
  games: Game[],
  previous: Map<number, number | null>,
  { fetch: get = fetch, pause = () => new Promise((resolve) => setTimeout(resolve, 1200)) }: Deps = {},
): Promise<Map<number, number | null>> {
  const weights = new Map<number, number | null>();
  let stopped = false;
  for (const { name, bgg } of games) {
    if (stopped) {
      const kept = previous.get(bgg);
      if (kept !== undefined) weights.set(bgg, kept);
      continue;
    }
    // A stalled answer stops the run like a rate limit, so what was fetched is
    // still written.
    const r = await get(STATS_URL(bgg), { signal: AbortSignal.timeout(30_000) }).catch((e: unknown) => {
      if ((e as Error).name !== 'TimeoutError') throw e;
      return undefined;
    });
    if (!r || r.status === 429) {
      console.error(
        `BoardGameGeek ${r ? 'is rate limiting (429)' : 'stopped answering'} at ${name}; keeping the last weights for the rest, re-run later.`,
      );
      stopped = true;
      const kept = previous.get(bgg);
      if (kept !== undefined) weights.set(bgg, kept);
      continue;
    }
    let stats: Stats | undefined;
    try {
      stats = r.ok ? ((await r.json()) as { item?: { stats?: Stats } }).item?.stats : undefined;
    } catch {
      // Not JSON: treated as no answer below.
    }
    const weight = Number(stats?.avgweight);
    if (!stats) {
      console.warn(`no answer for ${name} (BGG ${bgg}, ${r.status}); keeping its last weight`);
      const kept = previous.get(bgg);
      if (kept !== undefined) weights.set(bgg, kept);
    } else if (Number(stats.numweights) > 0 && weight >= 1 && weight <= 5) {
      weights.set(bgg, Math.round(weight * 100) / 100);
      console.log(`${name}: ${weight.toFixed(2)} (${stats.numweights} votes)`);
    } else {
      weights.set(bgg, null);
      console.warn(`${name} (BGG ${bgg}) has no weight votes; it shows no difficulty`);
    }
    // BGG asks clients to keep a gentle pace.
    await pause();
  }
  return weights;
}

/** The source of gameWeights.ts: the weights by id, each named. */
export function renderMap(games: Game[], weights: Map<number, number | null>): string {
  const named = new Map(games.map((g) => [g.bgg, g.name]));
  const lines = [...weights.keys()]
    .sort((a, b) => a - b)
    .map((id) => `  ${id}: ${weights.get(id)}, // ${named.get(id)}`)
    .join('\n');
  return `// Generated by \`npm run game-weights\` (scripts/fetch-game-weights.ts):
// BoardGameGeek's average weight, 1 (light) to 5 (heavy), for each game in
// games.ts and wishlist.ts with a BGG id, by that id; null where BGG has no
// weight votes.
// Those, and games missing here, show no difficulty. Do not edit by hand;
// re-run the script.
export const GAME_WEIGHTS: Record<number, number | null> = {
${lines}
};
`;
}

/** The command: reads the games under `dir`, fetches their weights and writes the map. */
export async function run(deps: Deps = {}): Promise<void> {
  const dir = deps.dir ?? '.';
  const games = readGames(
    await readFile(join(dir, 'src/data/games.ts'), 'utf8'),
    await readFile(join(dir, 'src/data/wishlist.ts'), 'utf8'),
  );
  let previous = new Map<number, number | null>();
  try {
    previous = readPrevious(await readFile(join(dir, MAP_FILE), 'utf8'));
  } catch {
    // No map yet.
  }
  const weights = await fetchWeights(games, previous, deps);
  await writeFile(join(dir, MAP_FILE), renderMap(games, weights));
  console.log(`${[...weights.values()].filter((w) => w !== null).length} of ${games.length} games have a weight.`);
}

if (import.meta.main) await run();
