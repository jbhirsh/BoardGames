// The file system and console as the stryker sweep scripts' command lines
// use them (stryker-shards.mjs, stryker-sweep-merge.mjs): each script's
// `main` takes this object, so its tests can pass a fake instead.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Reads, writes and prints for a command line, with `env` its environment. */
export function nodeIo(env = process.env) {
  return {
    /** The file's text, or null when it can't be read. */
    read: (file) => {
      try {
        return readFileSync(file, 'utf8');
      } catch {
        return null;
      }
    },
    /** Writes the file, making its directory first. */
    write: (file, text) => {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, text);
    },
    append: (file, text) => appendFileSync(file, text),
    env,
    log: console.log,
    error: console.error,
  };
}
