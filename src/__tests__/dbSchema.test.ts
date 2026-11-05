// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { games, meta, suggestions, votes } from '../../api/_db/schema';
import { testDb, type TestDb } from './helpers/testDb';

let current: TestDb | undefined;
afterEach(() => {
  current?.close();
  current = undefined;
});

describe('the committed migrations', () => {
  it('build the schema api/_db/schema.ts defines', async () => {
    current = await testDb();
    const { db } = current;
    await db.insert(meta).values({ key: 'k', value: 'v' });
    expect(await db.select().from(meta).where(eq(meta.key, 'k'))).toEqual([{ key: 'k', value: 'v' }]);
    // The key is the table's primary key: a second row for it is refused.
    await expect(db.insert(meta).values({ key: 'k', value: 'w' })).rejects.toThrow();
  });

  it("hold a vote to a game on the list, once per browser, and a suggestion's game to one too", async () => {
    current = await testDb();
    const { db } = current;
    const game: typeof games.$inferInsert = {
      id: 'azul',
      name: 'Azul',
      status: 'wanted',
      source: 'curated',
      minPlayers: 2,
      maxPlayers: 4,
      minutes: 45,
      description: '',
      keywords: [],
      awards: [],
    };
    await db.insert(games).values(game);
    await db.insert(votes).values({ gameId: 'azul', anonId: 'anon-aaaaaaaa' });
    await expect(db.insert(votes).values({ gameId: 'azul', anonId: 'anon-aaaaaaaa' })).rejects.toThrow();
    await expect(db.insert(votes).values({ gameId: 'brass', anonId: 'anon-aaaaaaaa' })).rejects.toThrow();
    const suggestion = {
      id: 'sug-1',
      gameName: 'Azul',
      name: 'Sam',
      note: '',
      status: 'approved',
      source: 'friend',
    } as const;
    await db.insert(suggestions).values({ ...suggestion, gameId: 'azul', createdAt: 1 });
    await expect(
      db.insert(suggestions).values({ ...suggestion, id: 'sug-2', gameId: 'brass', createdAt: 1 }),
    ).rejects.toThrow();
  });

  it('refuse a status or source no code knows', async () => {
    current = await testDb();
    const { db } = current;
    const game = {
      id: 'azul',
      name: 'Azul',
      minPlayers: 2,
      maxPlayers: 4,
      minutes: 45,
      description: '',
      keywords: [],
      awards: [],
    };
    // Drizzle wraps SQLite's error; its cause names the constraint refused.
    const refusal = (write: Promise<unknown>) =>
      write.then(
        () => 'accepted',
        (e: unknown) => String(e instanceof Error && e.cause instanceof Error ? e.cause.message : e),
      );
    expect(
      await refusal(
        db.run(sql`INSERT INTO games (id, name, status, source, min_players, max_players, minutes, description, keywords, awards)
        VALUES ('x', 'X', 'lost', 'curated', 1, 1, 0, '', '[]', '[]')`),
      ),
    ).toMatch(/CHECK constraint failed: games_status_known/);
    expect(
      await refusal(
        db.run(sql`INSERT INTO suggestions (id, game_name, name, note, status, source, created_at)
        VALUES ('sug-1', 'X', 'Sam', '', 'approved', 'stranger', 1)`),
      ),
    ).toMatch(/CHECK constraint failed: suggestions_source_known/);
    await db.insert(games).values({ ...game, status: 'owned', source: 'owner' });
  });

  it('index what the API filters on, and point votes and suggestions at their game', () => {
    expect(getTableConfig(games).indexes.map((i) => i.config.name)).toEqual(['games_status']);
    expect(getTableConfig(suggestions).indexes.map((i) => i.config.name)).toEqual(['suggestions_status']);
    expect(getTableConfig(votes).primaryKeys[0].columns.map((c) => c.name)).toEqual(['game_id', 'anon_id']);
    for (const table of [votes, suggestions]) {
      const [fk] = getTableConfig(table).foreignKeys;
      expect(getTableConfig(fk.reference().foreignTable).name).toBe('games');
    }
  });

  it("record what they applied in Drizzle's table, so a deploy applies each once", async () => {
    current = await testDb();
    const applied = await current.db.all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations`);
    expect(applied.length).toBeGreaterThan(0);
  });
});
