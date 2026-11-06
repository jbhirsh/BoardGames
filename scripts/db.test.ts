// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { connection, open, recordedEnvironment } from '../api/_db/connection.ts';
import { recordEnvironment, runMigrations } from './db.ts';
import { expectedEnvironment, migrateDatabase, run as runMigrate } from './db-migrate.ts';

let dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

/** A path for a database file nobody has opened yet. */
function freshPath() {
  const dir = mkdtempSync(join(tmpdir(), 'db-script-'));
  dirs.push(dir);
  return join(dir, 'app.db');
}

/** Opens the database at `path`, runs `fn`, and closes it. */
async function withDb<T>(path: string, fn: (db: ReturnType<typeof open>['db']) => Promise<T>): Promise<T> {
  const { db, client } = open({ url: `file:${path}` });
  try {
    return await fn(db);
  } finally {
    client.close();
  }
}

describe('connection', () => {
  it("prefers Turso's URL, with its token when set", () => {
    expect(
      connection({ TURSO_DATABASE_URL: 'libsql://x.turso.io', TURSO_AUTH_TOKEN: 't', DEV_DB_PATH: 'a.db' }),
    ).toEqual({
      url: 'libsql://x.turso.io',
      authToken: 't',
    });
    expect(connection({ TURSO_DATABASE_URL: 'libsql://x.turso.io' })).toEqual({ url: 'libsql://x.turso.io' });
  });

  it('falls back to a local file, then to nothing', () => {
    expect(connection({ DEV_DB_PATH: 'dev.db' })).toEqual({ url: 'file:dev.db' });
    expect(connection({})).toBeNull();
  });
});

describe('the environment record', () => {
  it('reads as none on a database with no tables yet, then as what was recorded', async () => {
    const path = freshPath();
    await withDb(path, async (db) => {
      expect(await recordedEnvironment(db)).toBeUndefined();
      await runMigrations(db);
      expect(await recordedEnvironment(db)).toBeUndefined();
      expect(await recordEnvironment(db, 'preview')).toBe(true);
      expect(await recordedEnvironment(db)).toBe('preview');
    });
  });

  it('is written once: the same again is a no-op, another is refused', async () => {
    await withDb(freshPath(), async (db) => {
      await runMigrations(db);
      await recordEnvironment(db, 'production');
      expect(await recordEnvironment(db, 'production')).toBe(false);
      await expect(recordEnvironment(db, 'preview')).rejects.toThrow(
        "already records production; it can't become preview",
      );
    });
  });
});

/** A migrations folder holding one migration newer than any committed, which creates table `later`. */
function laterMigration() {
  const later = mkdtempSync(join(tmpdir(), 'db-migrations-'));
  dirs.push(later);
  mkdirSync(join(later, 'meta'));
  writeFileSync(join(later, '0000_later.sql'), 'CREATE TABLE later (id integer);');
  writeFileSync(
    join(later, 'meta', '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'sqlite',
      entries: [{ idx: 0, version: '6', when: Date.now() + 60_000, tag: '0000_later', breakpoints: true }],
    }),
  );
  return later;
}

/** Whether the database at `path` has table `later`, the one laterMigration() creates. */
async function hasLater(path: string) {
  const rows = await withDb(path, (db) =>
    db.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE name = 'later'`),
  );
  return rows.length > 0;
}

/** Sets up the database at `path` as a deploy's claim would leave it: migrated, recording `env`. */
async function claimed(path: string, env: 'production' | 'preview') {
  await withDb(path, async (db) => {
    await runMigrations(db);
    await recordEnvironment(db, env);
  });
}

const MAIN_PRODUCTION = { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' };

describe('db:migrate', () => {
  it("is for a Vercel build's own environment, else the one named, if any", () => {
    expect(expectedEnvironment({ VERCEL: '1', VERCEL_ENV: 'production' }, 'preview')).toBe('production');
    expect(expectedEnvironment({ VERCEL_ENV: 'production' }, undefined)).toBe('production');
    expect(expectedEnvironment({ VERCEL: '1', VERCEL_ENV: 'development' }, 'preview')).toBeUndefined();
    expect(expectedEnvironment({}, 'preview')).toBe('preview');
    expect(expectedEnvironment({}, undefined)).toBeUndefined();
    expect(() => expectedEnvironment({}, 'staging')).toThrow('no database belongs to "staging"');
  });

  it("refuses a Vercel build that can't tell a preview from production", () => {
    expect(() => expectedEnvironment({ VERCEL: '1' }, undefined)).toThrow(/without VERCEL_ENV/);
  });

  it("migrates the shared preview database from any branch's preview build", async () => {
    const path = freshPath();
    await claimed(path, 'preview');
    expect(
      await runMigrate({ VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feature', DEV_DB_PATH: path }, []),
    ).toBe('db:migrate: migrated.');
  });

  it("migrates production only from main's code, as a promoted preview is rebuilt as production", async () => {
    const path = freshPath();
    await claimed(path, 'production');
    await expect(
      migrateDatabase(
        { ...MAIN_PRODUCTION, VERCEL_GIT_COMMIT_REF: 'feature', DEV_DB_PATH: path },
        undefined,
        laterMigration(),
      ),
    ).rejects.toThrow("a production build of feature: only main's code migrates production");
    await expect(migrateDatabase({ VERCEL: '1', VERCEL_ENV: 'production' }, undefined)).rejects.toThrow(
      /unknown branch/,
    );
    expect(await hasLater(path)).toBe(false);
  });

  it('fails with no database configured, on a deploy or not', async () => {
    await expect(runMigrate(MAIN_PRODUCTION, [])).rejects.toThrow(/no database configured/);
    await expect(migrateDatabase({}, undefined)).rejects.toThrow(/no database configured/);
  });

  it('claims a brand-new, empty database for the deploy that meets it first, then migrates it', async () => {
    const path = freshPath();
    expect(await runMigrate({ ...MAIN_PRODUCTION, DEV_DB_PATH: path }, [])).toBe(
      'db:migrate: claimed a new database and migrated it.',
    );
    expect(await withDb(path, recordedEnvironment)).toBe('production');
    // From then on it's production's: a preview build is refused, and production's next build migrates.
    await expect(migrateDatabase({ VERCEL_ENV: 'preview', DEV_DB_PATH: path }, undefined)).rejects.toThrow(
      /preview deploy is pointed at the production database/,
    );
    expect(await migrateDatabase({ ...MAIN_PRODUCTION, DEV_DB_PATH: path }, undefined)).toBe('migrated');
  });

  it('never claims a database holding tables, nor from a shell', async () => {
    const path = freshPath();
    await withDb(path, (db) => db.run(sql`CREATE TABLE someone_elses (id integer)`));
    await expect(migrateDatabase({ ...MAIN_PRODUCTION, DEV_DB_PATH: path }, undefined)).rejects.toThrow(
      /records no environment/,
    );
    const fresh = freshPath();
    await expect(migrateDatabase({ DEV_DB_PATH: fresh }, 'preview')).rejects.toThrow(/records no environment/);
    expect(await withDb(fresh, recordedEnvironment)).toBeUndefined();
  });

  it('migrates the database recording the environment it runs for', async () => {
    const path = freshPath();
    await claimed(path, 'production');
    expect(await migrateDatabase({ ...MAIN_PRODUCTION, DEV_DB_PATH: path }, undefined, laterMigration())).toBe(
      'migrated',
    );
    expect(await hasLater(path)).toBe(true);
  });

  it("refuses the other environment's database before changing anything", async () => {
    const path = freshPath();
    await claimed(path, 'preview');
    await expect(
      migrateDatabase({ ...MAIN_PRODUCTION, DEV_DB_PATH: path }, undefined, laterMigration()),
    ).rejects.toThrow(/production deploy is pointed at the preview database/);
    expect(await hasLater(path)).toBe(false);
  });

  it('migrates a real database from a shell only when told which one it is', async () => {
    const path = freshPath();
    await claimed(path, 'preview');
    await expect(migrateDatabase({ DEV_DB_PATH: path }, undefined, laterMigration())).rejects.toThrow(
      /this is the preview database/,
    );
    expect(await hasLater(path)).toBe(false);
    expect(await migrateDatabase({ DEV_DB_PATH: path }, 'preview', laterMigration())).toBe('migrated');
  });

  it('applies a development database its new migrations, with no record needed', async () => {
    expect(await runMigrate({ DEV_DB_PATH: freshPath() }, [])).toBe('db:migrate: migrated.');
  });
});
