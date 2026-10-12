// Narrows a restored Stryker incremental file to the files a PR run mutates.
//
// Stryker's incremental mode carries every old result for a file outside
// the current --mutate scope into the run's results, and the `break`
// threshold is checked against all of them. Restore main's full-sweep file
// into a PR run that mutates three files and the PR would be scored on the
// whole project, its three files diluted by thousands of reused results.
// Dropping the out-of-scope files first keeps the score to exactly the files
// under review, whether their results are reused or re-tested. Test files
// are kept: the diff needs them to tell which tests changed.
//
// Usage: node .github/scripts/stryker-incremental-scope.mjs <file> <a.ts,b.ts>
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** A report's file name as a cwd-relative, forward-slash path. */
export function relativeName(fileName, cwd = process.cwd()) {
  return path.relative(cwd, path.resolve(cwd, fileName)).split(path.sep).join('/');
}

/** The report with only the mutated files named in `scope` left in it. */
export function narrow(report, scope, cwd = process.cwd()) {
  const wanted = new Set(scope.map((name) => relativeName(name, cwd)));
  const files = Object.fromEntries(
    Object.entries(report.files ?? {}).filter(([name]) => wanted.has(relativeName(name, cwd))),
  );
  return { ...report, files };
}

/**
 * Narrows the file in place. A missing file is left missing (Stryker then
 * runs every mutant); one that will not parse is deleted for the same
 * result, since Stryker would stop on it instead.
 */
export function narrowFile(file, scope, log = console.log) {
  if (!existsSync(file)) {
    log(`No incremental file at ${file}: every mutant in scope will run.`);
    return;
  }
  let report;
  try {
    report = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    rmSync(file);
    log(`Unreadable incremental file at ${file}, removed: every mutant in scope will run.`);
    return;
  }
  const narrowed = narrow(report, scope);
  writeFileSync(file, JSON.stringify(narrowed));
  const kept = Object.keys(narrowed.files).length;
  const total = Object.keys(report.files ?? {}).length;
  log(`Kept ${kept} of ${total} file(s) from the incremental file for this run's scope.`);
}

/** The command line: `<file> <a.ts,b.ts>`. Returns the exit code. */
export function main(args, log = console.log, error = console.error) {
  const [file, scope] = args;
  if (!file || !scope) {
    error('Usage: stryker-incremental-scope.mjs <incremental file> <comma-separated files>');
    return 2;
  }
  narrowFile(file, scope.split(',').filter(Boolean), log);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
