// Applies the committed migrations (drizzle/) to the database, after
// checking it belongs where this runs (api/_db/environment.ts).
//
//   npm run db:migrate             the development database (DEV_DB_PATH)
//
// Vercel's build runs it once the app has built (vercel.json's
// buildCommand), before the deploy goes live, on the deploy's own database:
//
//   - production's only for main's code: a preview promoted to production is
//     rebuilt with production's settings, and must not bring an unmerged
//     PR's migration;
//   - preview's for every PR's preview, which all share that one database,
//     so a PR's preview has the tables it needs. Each PR branch carries
//     main's migrations, so it keeps up with main too. A PR that never
//     merges can leave its migration behind, and two previews migrating at
//     once can fail one build (Drizzle's migrator takes no lock; a rebuild
//     passes).
//
// A deploy claims a brand-new, empty database for its environment the first
// time it meets one (migrates it, then records the environment), so nobody
// handles a database's token: Vercel holds it. A database that already
// records an environment, or holds any table, is never claimed: the other
// environment's deploys are refused as before. One that went astray (say, a
// claim that migrated but couldn't write its record) is deleted and
// recreated in Turso, and the next deploy claims it.
//
// Until the API reads the database (#290's second part), a deploy with no
// database configured only says so, so deploys keep working before the
// databases exist; from then on it fails.

import { pathToFileURL } from 'node:url';
import { checkEnvironment, isDbEnvironment, type DbEnvironment } from '../api/_db/environment.ts';
import { connection, isEmpty, open, recordEnvironment, recordedEnvironment, runMigrations, type Env } from './db.ts';

/** What a run did, for its log line. */
export type Outcome = 'migrated' | 'claimed a new database and migrated it' | 'skipped: no database';

/**
 * The environment this run is for: a Vercel build's own (VERCEL_ENV;
 * none for `vercel dev`), elsewhere the one named on the command line, if
 * any. A Vercel build whose system variables aren't exposed is refused, as
 * it couldn't tell a preview from production.
 */
export function expectedEnvironment(env: Env, arg: string | undefined): DbEnvironment | undefined {
  const deploy = env.VERCEL_ENV;
  if (deploy === undefined && env.VERCEL) {
    throw new Error(
      'VERCEL is set without VERCEL_ENV: turn on "Automatically expose System Environment Variables" in the Vercel project',
    );
  }
  if (deploy === 'development') return undefined;
  const named = deploy ?? arg;
  if (named === undefined) return undefined;
  if (!isDbEnvironment(named)) throw new Error(`no database belongs to "${named}": name production or preview`);
  return named;
}

export async function migrateDatabase(env: Env, arg: string | undefined, migrations?: string): Promise<Outcome> {
  const expected = expectedEnvironment(env, arg);
  if (env.VERCEL_ENV === 'production' && env.VERCEL_GIT_COMMIT_REF !== 'main') {
    throw new Error(
      `a production build of ${env.VERCEL_GIT_COMMIT_REF ?? 'an unknown branch'}: only main's code migrates production`,
    );
  }
  const conn = connection(env);
  if (!conn) {
    if (env.VERCEL_ENV) return 'skipped: no database';
    throw new Error('no database configured: set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN), or DEV_DB_PATH');
  }
  const { db, client } = open(conn);
  try {
    const recorded = await recordedEnvironment(db);
    if (recorded === undefined && env.VERCEL_ENV && expected && (await isEmpty(db))) {
      await runMigrations(db, migrations);
      await recordEnvironment(db, expected);
      return 'claimed a new database and migrated it';
    }
    checkEnvironment(recorded, expected);
    await runMigrations(db, migrations);
    return 'migrated';
  } finally {
    client.close();
  }
}

/** The command: migrates, and returns its log line. */
export async function run(env: Env, args: string[]): Promise<string> {
  const outcome = await migrateDatabase(env, args[0]);
  return outcome === 'skipped: no database'
    ? 'db:migrate: no database configured (TURSO_DATABASE_URL); nothing migrated.'
    : `db:migrate: ${outcome}.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await run(process.env, process.argv.slice(2)));
}
