import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// The API's tables in Turso (libSQL), defined once here for Drizzle: the row
// types come from these definitions, and `npm run db:generate` writes each
// change to them as a migration in drizzle/, committed beside them and
// applied by scripts/db-migrate.ts at deploy, never at a cold start. CI fails
// when this file and drizzle/ disagree. A migration has to work with the code
// already deployed (Vercel builds before promoting a deploy, and a rollback
// runs old code on the new schema) unless its PR says otherwise.
//
// Imports nothing of the app's own: the scripts load it with Node, which
// doesn't resolve the API's `./x.js` imports to their `.ts` files.

/**
 * Settings the database keeps about itself. `environment` names the
 * deployment it belongs to (production or preview), written once when a
 * deploy first claims it (scripts/db-migrate.ts); the migrate script and the
 * API refuse a database whose record doesn't match where they run
 * (environment.ts).
 */
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
