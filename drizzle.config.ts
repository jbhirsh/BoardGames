import { defineConfig } from 'drizzle-kit';

// drizzle-kit's settings: `npm run db:generate` compares api/_db/schema.ts
// with the migrations in drizzle/ and writes one for the difference. It never
// connects to a database: the URL is a local file only because the dialect
// wants one, so drizzle-kit's push, migrate and studio can't reach a real
// database past the environment check; scripts/db-migrate.ts applies the
// migrations.
export default defineConfig({
  dialect: 'turso',
  schema: './api/_db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: 'file:local.db' },
});
