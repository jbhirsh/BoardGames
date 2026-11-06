// What the database scripts share (db-migrate.ts, and the tests), beside
// opening the database (api/_db/connection.ts, which the API uses too):
// applying the migrations in drizzle/, and writing the database's
// environment record (api/_db/environment.ts says why it has one).

import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { ENVIRONMENT_KEY, recordedEnvironment } from '../api/_db/connection.ts';
import type { DbEnvironment } from '../api/_db/environment.ts';
import { meta } from '../api/_db/schema.ts';

/** The committed migrations, beside the scripts' folder. */
const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * Whether the database holds no tables of its own yet (SQLite's and
 * libSQL's internal ones aside): a brand-new database, which a deploy may
 * claim for its environment.
 */
export async function isEmpty(db: LibSQLDatabase): Promise<boolean> {
  const tables = await db.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`);
  return tables.every(({ name }) => /^(sqlite_|libsql_|_)/.test(name));
}

/** Applies the migrations in `folder` the database doesn't have yet. */
export async function runMigrations(db: LibSQLDatabase, folder = MIGRATIONS): Promise<void> {
  await migrate(db, { migrationsFolder: folder });
}

/**
 * Records the database's environment, once: true when it was written, false
 * when it already held this one; a different one throws, since a database
 * changes environment only by hand.
 */
export async function recordEnvironment(db: LibSQLDatabase, env: DbEnvironment): Promise<boolean> {
  const recorded = await recordedEnvironment(db);
  if (recorded === env) return false;
  if (recorded !== undefined) {
    throw new Error(`the database already records ${recorded}; it can't become ${env} this way`);
  }
  await db.insert(meta).values({ key: ENVIRONMENT_KEY, value: env });
  return true;
}
