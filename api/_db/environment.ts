// Which deployment a database belongs to, checked before anything reads or
// changes it: a production deploy pointed at the preview database (or the
// other way round) by a mistyped environment variable would otherwise write
// to the wrong one, and a migration would change its schema. Each database
// records its environment once, in the `meta` table, when a deploy first
// claims it (scripts/db-migrate.ts); the migrate script and the API
// (client.ts) compare that record with where they run.
//
// Imports nothing, so the scripts can load it with Node as well as the API.

/** The deployments that have a database of their own. */
const ENVIRONMENTS = ['production', 'preview'] as const;
export type DbEnvironment = (typeof ENVIRONMENTS)[number];

export function isDbEnvironment(value: unknown): value is DbEnvironment {
  return ENVIRONMENTS.some((env) => env === value);
}

/**
 * Throws unless a database recording `recorded` (undefined: no record) may
 * be used by code running for `expected`: a production or preview
 * deployment, or a script told which one it's for, needs a database
 * recording that same environment; anything else (development, a test)
 * only a database recording none, so a shell that still holds a real
 * database's URL can't change it by accident.
 */
export function checkEnvironment(recorded: string | undefined, expected: DbEnvironment | undefined): void {
  if (expected === undefined) {
    if (recorded !== undefined) {
      throw new Error(`this is the ${recorded} database: name it to use it here (\`-- ${recorded}\`)`);
    }
    return;
  }
  if (recorded === undefined) {
    throw new Error(
      `the ${expected} database records no environment and isn't empty, so no deploy claims it: delete and recreate it in Turso, and the next deploy will`,
    );
  }
  if (recorded !== expected) {
    throw new Error(
      `a ${expected} deploy is pointed at the ${recorded} database: check TURSO_DATABASE_URL for ${expected}`,
    );
  }
}
