// Narrows a restored Stryker incremental file to the files a PR run mutates.
//
// Stryker's incremental mode carries every old result for a file outside
// the current --mutate scope into the run's results, and the `break`
// threshold is checked against all of them. Restore main's full-sweep file
// into a PR run that mutates three files and the PR would be scored on the
// whole project, its three files diluted by thousands of reused results.
// Dropping the out-of-scope files first keeps the score to exactly the files
// under review, whether their results are reused or re-tested. Test files
// are kept: the diff needs them to tell which tests changed. A scope entry
// naming lines (`a.ts:10-20`, what stryker-mutate-scope.mjs prints for a
// file the PR edited) keeps only that file's mutants starting on those
// lines, so the score is the changed code's alone there too.
//
// Usage: node .github/scripts/stryker-incremental-scope.mjs <file> <a.ts,b.ts:10-20>
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** A report's file name as a cwd-relative, forward-slash path. */
export function relativeName(fileName, cwd = process.cwd()) {
  return path.relative(cwd, path.resolve(cwd, fileName)).split(path.sep).join('/');
}

/**
 * The scope's entries by file: null for a whole file, else the `[first,
 * last]` line ranges named for it (a file named whole anywhere is whole).
 * @param {string[]} scope
 * @param {string} cwd
 * @returns {Map<string, Array<[number, number]> | null>}
 */
export function scopeLines(scope, cwd = process.cwd()) {
  const byFile = new Map();
  for (const entry of scope) {
    const lines = /^(.+):(\d+)-(\d+)$/.exec(entry);
    const name = relativeName(lines ? lines[1] : entry, cwd);
    if (!lines || byFile.get(name) === null) byFile.set(name, null);
    else byFile.set(name, [...(byFile.get(name) ?? []), [Number(lines[2]), Number(lines[3])]]);
  }
  return byFile;
}

/** The report with only the mutated files, and lines, named in `scope` left in it. */
export function narrow(report, scope, cwd = process.cwd()) {
  const wanted = scopeLines(scope, cwd);
  const files = {};
  for (const [name, file] of Object.entries(report.files ?? {})) {
    const key = relativeName(name, cwd);
    if (!wanted.has(key)) continue;
    const ranges = wanted.get(key);
    files[name] = ranges
      ? {
          ...file,
          mutants: (file.mutants ?? []).filter(({ location }) =>
            ranges.some(([first, last]) => location?.start?.line >= first && location.start.line <= last),
          ),
        }
      : file;
  }
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
    error('Usage: stryker-incremental-scope.mjs <incremental file> <comma-separated files or file:lines>');
    return 2;
  }
  narrowFile(file, scope.split(',').filter(Boolean), log);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
