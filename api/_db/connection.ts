// Opening the database, shared by the API (client.ts) and the database
// scripts (scripts/db.ts, db-migrate.ts): which database the environment
// points at, opening it, and reading the environment it records
// (environment.ts says why it has one).
//
// The database is Turso's (TURSO_DATABASE_URL, with TURSO_AUTH_TOKEN), or a
// local SQLite file for development (DEV_DB_PATH).
//
// Imports nothing of the app's own: the scripts load it with Node, which
// doesn't resolve the API's `./x.js` imports to their `.ts` files.

import { createClient, type Client } from '@libsql/client';
import { sql } from 'drizzle-orm';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';

export type Env = Record<string, string | undefined>;

export interface Connection {
  url: string;
  authToken?: string;
}

export interface Opened {
  db: LibSQLDatabase;
  client: Client;
}

/** The `meta` row (schema.ts) holding the database's environment record. */
export const ENVIRONMENT_KEY = 'environment';

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

/**
 * The environment the database records, or undefined (none, or not even a
 * `meta` table yet). Plain SQL, as schema.ts is the app's own.
 */
export async function recordedEnvironment(db: LibSQLDatabase): Promise<string | undefined> {
  const tables = await db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'`,
  );
  if (tables.length === 0) return undefined;
  const rows = await db.all<{ value: string }>(sql`SELECT value FROM meta WHERE key = ${ENVIRONMENT_KEY}`);
  return rows[0]?.value;
}
