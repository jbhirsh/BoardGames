// The API's database: this deployment's Turso database (connection.ts),
// opened once per function instance and checked before its first use
// against the environment it records (environment.ts), so a preview pointed
// at production's database, or the other way round, reads and writes
// nothing there. Sign-in (api/_auth.ts) is its first user; #290's part 2b
// reads the app's tables through it too.

import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { connection, open, recordedEnvironment, type Env } from './connection.js';
import { checkEnvironment, isDbEnvironment, type DbEnvironment } from './environment.js';

/** The environment a deployment's database must record: production's or preview's, none elsewhere. */
export function deployEnvironment(env: Env): DbEnvironment | undefined {
  return isDbEnvironment(env.VERCEL_ENV) ? env.VERCEL_ENV : undefined;
}

/**
 * Opens the database the environment names and checks its record. A
 * database that isn't this deployment's is closed again and refused, as is
 * a deployment with no database configured.
 */
export async function openChecked(env: Env): Promise<LibSQLDatabase> {
  const conn = connection(env);
  if (!conn) throw new Error('no database configured: set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN)');
  const { db, client } = open(conn);
  try {
    checkEnvironment(await recordedEnvironment(db), deployEnvironment(env));
  } catch (err) {
    client.close();
    throw err;
  }
  return db;
}

let opened: Promise<LibSQLDatabase> | undefined;

/**
 * This instance's database, opened and checked on first use. One that
 * couldn't be opened or was refused is tried afresh by the next request,
 * so a database briefly out of reach doesn't take the instance down with it.
 */
export function database(env: Env = process.env): Promise<LibSQLDatabase> {
  opened ??= openChecked(env).catch((err: unknown) => {
    opened = undefined;
    throw err;
  });
  return opened;
}
