// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { meta } from '../../api/_db/schema';
import { testDb, type TestDb } from './helpers/testDb';

// The API's database client (api/_db/client.ts): opened once an instance,
// and refused before any query when it isn't this deployment's.

let current: TestDb | undefined;
afterEach(() => {
  current?.close();
  current = undefined;
  vi.resetModules();
});

const load = () => import('../../api/_db/client');

describe('the API database client', () => {
  it("opens the deployment's database once, and checks it belongs here", async () => {
    current = await testDb();
    await current.db.insert(meta).values({ key: 'environment', value: 'preview' });
    const { database, deployEnvironment } = await load();
    const env = { VERCEL_ENV: 'preview', DEV_DB_PATH: current.path };
    const db = await database(env);
    expect(await database(env)).toBe(db);
    expect(await db.select().from(meta)).toEqual([{ key: 'environment', value: 'preview' }]);
    expect(deployEnvironment({ VERCEL_ENV: 'production' })).toBe('production');
    expect(deployEnvironment({ VERCEL_ENV: 'development' })).toBeUndefined();
    expect(deployEnvironment({})).toBeUndefined();
  });

  it("refuses another environment's database, then tries afresh", async () => {
    current = await testDb();
    await current.db.insert(meta).values({ key: 'environment', value: 'production' });
    const { database } = await load();
    const env = { VERCEL_ENV: 'preview', DEV_DB_PATH: current.path };
    await expect(database(env)).rejects.toThrow('a preview deploy is pointed at the production database');
    await expect(database({ VERCEL_ENV: 'production', DEV_DB_PATH: current.path })).resolves.toBeDefined();
  });

  it("refuses a real database's record where no deployment is named, and a deploy with none configured", async () => {
    current = await testDb();
    await current.db.insert(meta).values({ key: 'environment', value: 'production' });
    const { openChecked } = await load();
    await expect(openChecked({ DEV_DB_PATH: current.path })).rejects.toThrow('this is the production database');
    await expect(openChecked({ VERCEL_ENV: 'preview' })).rejects.toThrow('no database configured');
  });
});
