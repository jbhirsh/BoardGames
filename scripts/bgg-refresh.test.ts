// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { bggInfo, games, ownerAwards } from '../api/_db/schema.ts';
import { testDb, type TestDb } from '../src/__tests__/helpers/testDb.ts';
import { recordEnvironment } from './db.ts';
import { collectionIds, due, PER_BUILD, refresh, REFRESH_AFTER_MS } from './bgg-refresh.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;

describe('due', () => {
  it('takes the ids with no row first, then the oldest past 30 days, ten in all', () => {
    const rows = [
      { bggId: 1, fetchedAt: NOW - REFRESH_AFTER_MS - 5 },
      { bggId: 2, fetchedAt: NOW - REFRESH_AFTER_MS - 50 },
      { bggId: 3, fetchedAt: NOW - DAY },
      { bggId: 4, fetchedAt: 0 },
    ];
    expect(due([1, 2, 3, 4, 5], rows, NOW)).toEqual([5, 4, 2, 1]);
    const many = Array.from({ length: 30 }, (_, i) => i + 100);
    expect(due(many, [], NOW)).toHaveLength(PER_BUILD);
  });

  it('reads every id in games.ts as it stands', () => {
    const ids = collectionIds(readFileSync('src/data/games.ts', 'utf8'));
    expect(ids).toContain(13);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('refresh', () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await testDb();
    await recordEnvironment(db.db, 'production');
  });
  afterEach(() => db.close());

  const env = () => ({
    TURSO_DATABASE_URL: `file:${db.path}`,
    VERCEL: '1',
    VERCEL_ENV: 'production',
    VERCEL_GIT_COMMIT_REF: 'main',
  });
  const answer = (body: unknown) => Promise.resolve({ status: 200, text: async () => JSON.stringify(body) });
  const fetchLike = vi.fn(async (url: string) => {
    const id = Number(/objectid=(\d+)/.exec(url)?.[1]);
    if (id === 404) return { status: 404, text: async () => '' };
    if (url.includes('/dynamicinfo?')) return answer({ item: { stats: { avgweight: '2.5', numweights: '9' } } });
    return answer({ item: { name: `Game ${id}`, short_description: 'A line.', links: { boardgamehonor: [] } } });
  });
  const deps = (source: string) => ({
    fetch: fetchLike,
    pause: async () => {},
    now: () => NOW,
    log: vi.fn(),
    collection: async () => source,
  });

  it('runs in production builds only', async () => {
    expect(await refresh({ ...env(), VERCEL_ENV: 'preview' }, undefined, deps('bgg: 13'))).toBe(
      'bgg-refresh: production builds only; skipped.',
    );
    expect(fetchLike).not.toHaveBeenCalled();
  });

  it('fills a missing row and refreshes a stale one, leaving a fresh one', async () => {
    await db.db.insert(bggInfo).values([
      { bggId: 13, name: 'Old', honours: [], fetchedAt: NOW - REFRESH_AFTER_MS - 1 },
      { bggId: 14, name: 'Fresh', honours: [], fetchedAt: NOW - DAY },
    ]);
    expect(await refresh(env(), undefined, deps('bgg: 13, bgg: 14, bgg: 15'))).toBe('bgg-refresh: refreshed 2 of 2.');
    const rows = await db.db.select().from(bggInfo).orderBy(bggInfo.bggId);
    expect(rows.map((r) => [r.bggId, r.name, r.summary, r.weight, r.fetchedAt])).toEqual([
      [13, 'Game 13', 'A line.', 2.5, NOW],
      [14, 'Fresh', null, null, NOW - DAY],
      [15, 'Game 15', 'A line.', 2.5, NOW],
    ]);
  });

  it("asks about a wishlist game's id too, and logs a miss without failing", async () => {
    await db.db.insert(games).values({
      id: 'gone-missing',
      name: 'Gone Missing',
      status: 'wanted',
      source: 'owner',
      minPlayers: 1,
      maxPlayers: 4,
      minutes: 0,
      description: '',
      keywords: [],
      bggId: 404,
    });
    const d = deps('');
    expect(await refresh(env(), undefined, d)).toBe('bgg-refresh: refreshed 0 of 1.');
    expect(d.log).toHaveBeenCalledWith("bgg-refresh: BoardGameGeek didn't answer for 404; the next build tries again.");
  });

  it('moves a row BGG no longer answers for to the back, a day from being asked again', async () => {
    await db.db.insert(bggInfo).values({ bggId: 404, name: 'Gone', honours: [], fetchedAt: 0 });
    expect(await refresh(env(), undefined, deps(''))).toBe('bgg-refresh: refreshed 0 of 1.');
    const [row] = await db.db.select().from(bggInfo);
    expect(row.fetchedAt).toBe(NOW - REFRESH_AFTER_MS + DAY);
    expect(await refresh(env(), undefined, deps(''))).toBe('bgg-refresh: refreshed 0 of 0.');
  });

  it('gives an id with no row that BGG never answers for an empty one, so it rotates with the stale rows', async () => {
    const d = deps('bgg: 404, bgg: 13');
    expect(await refresh(env(), undefined, d)).toBe('bgg-refresh: refreshed 1 of 2.');
    const [missing] = await db.db.select().from(bggInfo).where(eq(bggInfo.bggId, 404));
    expect(missing).toMatchObject({ name: 'BoardGameGeek 404', summary: null, weight: null, honours: [] });
    expect(missing.fetchedAt).toBe(NOW - REFRESH_AFTER_MS + DAY);
    // The next build doesn't ask again; a day later, it's one stale row among the rest.
    expect(await refresh(env(), undefined, d)).toBe('bgg-refresh: refreshed 0 of 0.');
    expect(await refresh(env(), undefined, { ...d, now: () => NOW + DAY + 1 })).toBe('bgg-refresh: refreshed 0 of 1.');
  });

  it('fills the rows of the editions that lend their honours, and of the games with the owner’s awards', async () => {
    await db.db
      .insert(bggInfo)
      .values({ bggId: 209418, name: 'Dominion', honours: [], honoursFrom: 36218, fetchedAt: NOW });
    await db.db.insert(ownerAwards).values({ bggId: 77, name: 'Dice Tower Best Game', year: 2010 });
    expect(await refresh(env(), undefined, deps(''))).toBe('bgg-refresh: refreshed 2 of 2.');
    expect((await db.db.select().from(bggInfo)).map((r) => r.bggId).sort((a, b) => a - b)).toEqual([77, 36218, 209418]);
  });

  it('never fails the build, even on a database that is not production’s', async () => {
    const other = await testDb();
    try {
      await recordEnvironment(other.db, 'preview');
      const out = await refresh({ ...env(), TURSO_DATABASE_URL: `file:${other.path}` }, undefined, deps('bgg: 13'));
      expect(out).toMatch(/^bgg-refresh: skipped \(.+\); the build goes on\.$/);
    } finally {
      other.close();
    }
  });
});
