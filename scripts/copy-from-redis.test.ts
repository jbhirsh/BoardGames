// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bggInfo, games, meta, ownerAwards, suggestions, votes } from '../api/_db/schema.ts';
import { testDb, type TestDb } from '../src/__tests__/helpers/testDb.ts';
import { recordEnvironment } from './db.ts';
import {
  bggHasWin,
  bggIds,
  bodyOf,
  copy,
  COPY_VERSION,
  MARKER_KEY,
  plan,
  readRedis,
  upstash,
  type Fetched,
  type RedisData,
  type Seed,
} from './copy-from-redis.ts';

// Hand-made fixtures: a seed of two entries, a few stored suggestions and
// honours. None of it is BoardGameGeek's.

const entry = (id: string, name: string, bggId: number) => ({
  id,
  name,
  status: 'wanted' as const,
  source: 'curated' as const,
  players: '2–4',
  minPlayers: 2,
  maxPlayers: 4,
  dur: '30 min',
  minutes: 30,
  description: `${name}.`,
  keywords: ['strategy'],
  section: 'strategy',
  video: `how to play ${name}`,
  image: `/images/wishlist/${id}.jpg`,
  bggId,
});

const SEED: Seed = {
  wishlist: [entry('splendor', 'Splendor', 148228), entry('cascadia', 'Cascadia', 295947)],
  awards: {
    148228: [
      { name: 'Golden Geek Game of the Year', year: 2014 },
      { name: 'Dice Tower Best Family Game', year: 2014 },
    ],
    209418: [{ name: 'Spiel des Jahres', year: 2009 }],
  },
  honoursFrom: { 209418: 36218 },
  collection: [209418],
};

const win = (name: string, year: number) => ({ name, year, result: 'Winner' });
const item = (
  name: string,
  honours: Fetched['item'] extends infer I ? (I extends { honours: infer H } ? H : never) : never,
) => ({
  name,
  summary: `${name} in a line.`,
  honours,
});

const BGG = new Map<number, Fetched>([
  [148228, { item: item('Splendor', [win('Golden Geek Best Family Board Game', 2014)]), weight: 1.8 }],
  [295947, { item: null, weight: undefined }],
  [209418, { item: item('Dominion (Second Edition)', []), weight: 2.3 }],
  [36218, { item: item('Dominion', [win('Spiel des Jahres', 2009)]), weight: 2.4 }],
]);

const REDIS: RedisData = {
  suggestions: [
    {
      id: 'sug-a',
      game: 'spirit island',
      name: 'Jess',
      note: 'Co-op!',
      status: 'pending',
      createdAt: '10',
      token: 't',
    },
    {
      id: 'sug-b',
      game: 'Root',
      name: 'Alex',
      note: '',
      status: 'approved',
      createdAt: '20',
      decidedAt: '30',
      source: 'friend',
      details: JSON.stringify({
        bggId: 237182,
        min: 2,
        max: 4,
        mins: 90,
        desc: 'War.',
        kw: ['strategy'],
        type: 'heavy',
      }),
    },
    { id: 'sug-c', game: 'splendor', name: 'Sam', note: '', status: 'approved', createdAt: '40', decidedAt: '50' },
    { id: 'sug-d', game: 'Azul', name: 'Sam', note: '', status: 'denied', createdAt: '60', decidedAt: '70' },
  ],
  votes: { splendor: ['anon-1', 'anon-2'], 'sug-c': ['anon-2', 'anon-3'], 'sug-b': ['anon-1'], 'sug-gone': ['anon-9'] },
};

describe('the award matcher', () => {
  it('names a body by what its awards are called, or by their first two words', () => {
    expect(bodyOf('Kennerspiel des Jahres')).toBe(bodyOf('Spiel des Jahres'));
    expect(bodyOf('Golden Geek Best Family Board Game')).toBe('goldengeek');
    expect(bodyOf('Fixture Prize Best Game')).toBe('fixture prize');
  });

  it("finds a hand-written win in BGG's honours: the same body, a year either way, a Winner", () => {
    const honours = [
      win('Golden Geek Best Family Board Game', 2015),
      { name: 'Dice Tower Best Game', year: 2014, result: 'Nominee' },
    ];
    expect(bggHasWin({ name: 'Golden Geek Game of the Year', year: 2014 }, honours)).toBe(true);
    expect(bggHasWin({ name: 'Golden Geek Game of the Year', year: 2012 }, honours)).toBe(false);
    expect(bggHasWin({ name: 'Dice Tower Best Game', year: 2014 }, honours)).toBe(false);
  });
});

describe('plan', () => {
  const p = plan(SEED, REDIS, BGG, new Map([['spirit island', 'Spirit Island']]), 1000);

  it('makes the seed entries and the approved suggestions games, merging a duplicate into its entry', () => {
    expect(p.games.map((g) => [g.id, g.name, g.status, g.section])).toEqual([
      ['splendor', 'Splendor', 'wanted', 'strategy'],
      ['cascadia', 'Cascadia', 'wanted', 'strategy'],
      ['sug-b', 'Root', 'wanted', 'heavy'],
    ]);
    expect(p.games[2]).toMatchObject({
      suggestedBy: 'Alex',
      players: '2–4',
      dur: '90 min',
      bggId: 237182,
      createdAt: 30,
    });
    expect(p.suggestions.map((s) => [s.id, s.gameName, s.status, s.gameId])).toEqual([
      ['sug-a', 'Spirit Island', 'pending', null],
      ['sug-b', 'Root', 'approved', 'sug-b'],
      ['sug-c', 'splendor', 'approved', 'splendor'],
      ['sug-d', 'Azul', 'denied', null],
    ]);
  });

  it('takes the votes as a union, a merged entry’s included, leaving out an id on no list', () => {
    expect(p.votes).toEqual([
      { gameId: 'splendor', anonId: 'anon-1' },
      { gameId: 'splendor', anonId: 'anon-2' },
      { gameId: 'splendor', anonId: 'anon-3' },
      { gameId: 'sug-b', anonId: 'anon-1' },
    ]);
    expect(p.report).toContain('votes left out: 1 for sug-gone, which is on no list');
  });

  it("keeps BGG's data by id, a miss oldest for the refresh, and an edition's borrowed honours", () => {
    expect(p.info.map((i) => [i.bggId, i.name, i.weight, i.fetchedAt, i.honoursFrom])).toEqual([
      [36218, 'Dominion', 2.4, 1000, null],
      [148228, 'Splendor', 1.8, 1000, null],
      [209418, 'Dominion (Second Edition)', 2.3, 1000, 36218],
      [295947, 'Cascadia', null, 0, null],
    ]);
  });

  it('keeps as the owner’s only the hand-written wins BGG lacks, judged by the edition it borrows from', () => {
    expect(p.awards).toEqual([{ bggId: 148228, name: 'Dice Tower Best Family Game', year: 2014 }]);
    expect(p.report).toContain("kept as the owner's: 148228 Dice Tower Best Family Game, 2014");
    expect(p.report).toContain("renamed: “spirit island” → “Spirit Island” (BoardGameGeek's spelling)");
  });

  it('asks BGG about every id: the collection, the entries, the stored games and the borrowed editions', () => {
    expect(bggIds(SEED, REDIS)).toEqual([36218, 148228, 209418, 237182, 295947]);
  });
});

describe('readRedis', () => {
  it('reads every suggestion hash and vote set by SCAN, through Upstash’s REST API', async () => {
    const answers: Record<string, unknown> = {
      'SCAN 0 MATCH suggestions:sug-* COUNT 500': ['7', ['suggestions:sug-a']],
      'SCAN 7 MATCH suggestions:sug-* COUNT 500': ['0', ['suggestions:sug-b', 'suggestions:sug-a']],
      'HGETALL suggestions:sug-a': ['id', 'sug-a', 'game', 'Azul', 'name', 'Sam'],
      'HGETALL suggestions:sug-b': [],
      'SCAN 0 MATCH wishlist:votes:* COUNT 500': ['0', ['wishlist:votes:splendor']],
      'SMEMBERS wishlist:votes:splendor': ['b', 'a'],
    };
    const fetchLike = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const args = JSON.parse(String(init?.body)) as string[];
      return Response.json({ result: answers[args.join(' ')] });
    });
    const data = await readRedis(upstash('https://kv.example', 'token', fetchLike as unknown as typeof fetch));
    expect(data).toEqual({
      suggestions: [{ id: 'sug-a', game: 'Azul', name: 'Sam' }],
      votes: { splendor: ['a', 'b'] },
    });
    expect(fetchLike.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer token' } });
  });

  it('fails on an error from Upstash', async () => {
    const failing = upstash(
      'https://kv.example',
      't',
      (async () => new Response('', { status: 401 })) as unknown as typeof fetch,
    );
    await expect(readRedis(failing)).rejects.toThrow('Upstash answered 401 to SCAN');
  });
});

describe('copy', () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await testDb();
  });
  afterEach(() => db.close());

  const quiet = {
    fetch: (async () => new Response('', { status: 404 })) as never,
    pause: async () => {},
    log: () => {},
  };
  const counts = async () => ({
    games: (await db.db.select().from(games)).length,
    suggestions: (await db.db.select().from(suggestions)).length,
    votes: (await db.db.select().from(votes)).length,
    info: (await db.db.select().from(bggInfo)).length,
    awards: (await db.db.select().from(ownerAwards)).length,
  });

  it('copies the seed once, then does nothing on the next run', async () => {
    const env = { DEV_DB_PATH: db.path };
    expect(await copy(env, undefined, quiet)).toMatch(
      /^db:copy: copied 39 games, 0 suggestions, 0 votes, \d+ BoardGameGeek rows/,
    );
    const first = await counts();
    expect(first.games).toBe(39);
    // BGG answered nothing, so every hand-written award is kept, for now.
    expect(first.awards).toBeGreaterThan(200);
    expect(await copy(env, undefined, quiet)).toBe(`db:copy: already copied (${COPY_VERSION}).`);
    expect(await counts()).toEqual(first);
  });

  it('copies a preview database again under a new version, and never production', async () => {
    await recordEnvironment(db.db, 'preview');
    await db.db.insert(meta).values({ key: MARKER_KEY, value: 'v1' });
    await db.db.insert(games).values(entry('stale', 'Stale', 1));
    const env = { TURSO_DATABASE_URL: `file:${db.path}`, VERCEL: '1', VERCEL_ENV: 'preview' };
    expect(await copy(env, undefined, quiet)).toMatch(/copied 39 games/);
    expect((await db.db.select().from(games)).some((g) => g.id === 'stale')).toBe(false);
  });

  it('refuses to copy production without Redis, writing nothing', async () => {
    await recordEnvironment(db.db, 'production');
    const env = {
      TURSO_DATABASE_URL: `file:${db.path}`,
      VERCEL: '1',
      VERCEL_ENV: 'production',
      VERCEL_GIT_COMMIT_REF: 'main',
    };
    await expect(copy(env, undefined, quiet)).rejects.toThrow('KV_REST_API_URL and KV_REST_API_TOKEN must be set');
    expect((await counts()).games).toBe(0);
  });
});
