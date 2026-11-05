// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { meta } from '../../api/_db/schema';
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

  it("record what they applied in Drizzle's table, so a deploy applies each once", async () => {
    current = await testDb();
    const applied = await current.db.all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations`);
    expect(applied.length).toBeGreaterThan(0);
  });
});
