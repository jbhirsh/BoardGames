import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open, type Opened } from '../../../api/_db/connection.ts';
import { runMigrations } from '../../../scripts/db.ts';

export interface TestDb extends Opened {
  /** The database's file, for a test that opens it again as a script would. */
  path: string;
  /** Closes the client and deletes the file. */
  close: () => void;
}

/**
 * A fresh database with every committed migration (drizzle/) applied, as a
 * deploy would leave it: a SQLite file in its own temporary folder, since an
 * in-memory libSQL database isn't guaranteed to survive a transaction.
 * Tests using it run in Node (`@vitest-environment node`), not jsdom.
 */
export async function testDb(): Promise<TestDb> {
  const dir = mkdtempSync(join(tmpdir(), 'db-'));
  const path = join(dir, 'test.db');
  const opened = open({ url: `file:${path}` });
  await runMigrations(opened.db);
  return {
    ...opened,
    path,
    close: () => {
      opened.client.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
