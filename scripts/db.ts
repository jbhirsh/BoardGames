// What the database scripts share (db-migrate.ts, and the tests): which
// database the environment points at, opening it, applying the migrations
// in drizzle/, and reading or writing its environment record
// (api/_db/environment.ts says why it has one).
//
// The database is Turso's (TURSO_DATABASE_URL, with TURSO_AUTH_TOKEN), or a
// local SQLite file for development (DEV_DB_PATH).

import { fileURLToPath } from 'node:url';
import { createClient, type Client } from '@libsql/client';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { ENVIRONMENT_KEY, type DbEnvironment } from '../api/_db/environment.ts';
import { meta } from '../api/_db/schema.ts';

export type Env = Record<string, string | undefined>;

export interface Connection {
  url: string;
  authToken?: string;
}

export interface Opened {
  db: LibSQLDatabase;
  client: Client;
}

/** The committed migrations, beside the scripts' folder. */
const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));

/** The database the environment names, or null when it names none. */
export function connection(env: Env): Connection | null {
  if (env.TURSO_DATABASE_URL) {
    return env.TURSO_AUTH_TOKEN
      ? { url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN }
      : { url: env.TURSO_DATABASE_URL };
  }
  if (env.DEV_DB_PATH) return { url: `file:${env.DEV_DB_PATH}` };
  return null;
}

export function open(conn: Connection): Opened {
  const client = createClient(conn);
  return { db: drizzle(client), client };
}

/** The environment the database records, or undefined (none, or not even a `meta` table yet). */
export async function recordedEnvironment(db: LibSQLDatabase): Promise<string | undefined> {
  const tables = await db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'`,
  );
  if (tables.length === 0) return undefined;
  const rows = await db.select({ value: meta.value }).from(meta).where(eq(meta.key, ENVIRONMENT_KEY));
  return rows[0]?.value;
}

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
