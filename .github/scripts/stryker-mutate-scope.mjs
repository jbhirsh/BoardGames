// Picks the changed files a PR's Stryker run mutates: those that the
// `mutate` globs in stryker.config.json select.
//
// The workflow used to repeat the globs as a list of paths, which could
// drift from the config (a file the config mutates going untested at PR
// time, or one it leaves out being mutated, since --mutate replaces the
// config's list). Reading the globs keeps one source of truth. They are
// applied the way Stryker applies them: in order, a pattern starting with
// `!` taking back what an earlier one selected, matched without dotfiles.
//
// A file whose change is formatting alone is left out too: when Prettier
// turns its version at the merge base into exactly the file as it is now,
// nothing a mutant could change has changed, so its earlier results stand
// (a reformat would otherwise re-test every mutant). A file new to the
// branch, or one Prettier can't read, stays in.
//
// Of a file that was there before, only the lines the branch adds or changes
// are mutated (`file:first-last`, one entry per block, from `git diff -U0`):
// the rest of the file is code the PR didn't write. A PR touching most of
// the components (the Tailwind migration, about 80 files) otherwise mutated
// every line of each, over 5,000 mutants, and outran the job's three hours.
// A file new to the branch is mutated whole, and one whose change only
// deletes lines has nothing left to mutate.
//
// A PR that changes nothing in scope runs no mutants. Unless it touches what
// Stryker's own setup rests on (WIRING: its config, the Vitest config and
// setup, the dependencies and patches, this workflow and its scripts), it
// skips Stryker altogether: a smoke run there cost about nine minutes on PRs
// that change only pictures or docs, nearly all of it Stryker's dry run and
// mutants. The install still runs, as this script needs Prettier. One that
// does touch it runs a small smoke scope, so a broken setup still shows.
//
// Usage: git diff --name-only ... | MUTATE_BASE=origin/main node .github/scripts/stryker-mutate-scope.mjs
// Prints the --mutate entries, one per line (nothing when none are). Without
// MUTATE_BASE, files are printed whole and none is checked for a
// formatting-only change. With --wiring it prints instead whether any of the
// changed files is one Stryker's setup rests on: `true` or `false`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as prettier from 'prettier';

/**
 * The files Stryker's own setup rests on: a change to one can break a run
 * however little source it mutates, so a PR touching one is smoke-tested.
 */
export const WIRING = [
  'stryker.config.json',
  'vite.config.ts',
  'src/setupTests.ts',
  'tsconfig*.json',
  'package.json',
  'package-lock.json',
  'patches/**',
  '.github/workflows/mutation.yml',
  '.github/scripts/stryker-*.mjs',
];

/** Whether any of `changed` (newline-separated paths) is one WIRING names. */
export function wiringChanged(changed) {
  return changed
    .split('\n')
    .map((name) => name.trim())
    .some((name) => name !== '' && WIRING.some((pattern) => path.matchesGlob(name, pattern)));
}

/** Whether the ordered `mutate` globs select `file` (a repo-relative path). */
export function inMutateScope(file, patterns) {
  let selected = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!');
    if (path.matchesGlob(file, negated ? pattern.slice(1) : pattern)) selected = !negated;
  }
  return selected;
}

/** The files among `changed` (newline-separated) that the config mutates. */
export function mutateScope(changed, config) {
  if (!Array.isArray(config.mutate)) throw new Error('stryker.config.json has no mutate list');
  return changed
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name !== '' && inMutateScope(name, config.mutate));
}

/**
 * Prettier's output for `text` as the file at `file`, with the repository's
 * config for it, or null when Prettier can't read it.
 * @param {string} text
 * @param {string} file
 */
export async function formatAs(text, file) {
  try {
    const options = (await prettier.resolveConfig(file)) ?? {};
    return await prettier.format(text, { ...options, filepath: file });
  } catch {
    return null;
  }
}

/**
 * The files among `files` whose change is more than formatting: those with
 * no version at the base, or whose base version, formatted, isn't the file
 * as it is now.
 * @param {string[]} files
 * @param {{ before: (file: string) => string | null, now: (file: string) => string,
 *   format: (text: string, file: string) => Promise<string | null> }} io
 */
export async function substantive(files, { before, now, format }) {
  const kept = [];
  for (const file of files) {
    const base = before(file);
    if (base === null || (await format(base, file)) !== now(file)) kept.push(file);
  }
  return kept;
}

/**
 * The line ranges a diff with no context lines (`git diff -U0`) adds to its
 * new side, as `[first, last]` pairs; a hunk that only deletes adds none.
 * @param {string} diff
 * @returns {Array<[number, number]>}
 */
export function addedRanges(diff) {
  const ranges = [];
  for (const [, start, count] of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const lines = count === undefined ? 1 : Number(count);
    if (lines > 0) ranges.push([Number(start), Number(start) + lines - 1]);
  }
  return ranges;
}

/**
 * `file` as --mutate entries: whole when `ranges` is null (a new file), else
 * one `file:first-last` per range, so none when it only lost lines.
 * @param {string} file
 * @param {Array<[number, number]> | null} ranges
 */
export function mutateEntries(file, ranges) {
  return ranges === null ? [file] : ranges.map(([first, last]) => `${file}:${first}-${last}`);
}

/**
 * Reads files from git at the merge base of `ref` and HEAD, and from the
 * working tree, run in `cwd`; `ranges` is the lines the working tree adds
 * or changes against that base, null for a file new to the branch.
 * @param {string} ref
 * @param {string} cwd
 */
export function gitIo(ref, cwd) {
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const base = git(['merge-base', ref, 'HEAD']).trim();
  return {
    before: (file) => {
      try {
        return git(['show', `${base}:${file}`]);
      } catch {
        return null;
      }
    },
    now: (file) => readFileSync(path.join(cwd, file), 'utf8'),
    format: (text, file) => formatAs(text, path.join(cwd, file)),
    ranges: (file) => {
      try {
        git(['cat-file', '-e', `${base}:${file}`]);
      } catch {
        return null;
      }
      return addedRanges(git(['diff', '-U0', '--no-ext-diff', '--no-color', base, '--', file]));
    },
  };
}

/**
 * The command's output for the changed files and the config's text; with
 * `io`, files changed only in formatting are left out and the rest narrowed
 * to the lines that changed.
 */
export async function main(changed, configText, io) {
  const inScope = mutateScope(changed, JSON.parse(configText));
  const entries = io
    ? (await substantive(inScope, io)).flatMap((file) => mutateEntries(file, io.ranges(file)))
    : inScope;
  return entries.length > 0 ? `${entries.join('\n')}\n` : '';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--wiring')) {
    process.stdout.write(`${wiringChanged(readFileSync(0, 'utf8'))}\n`);
  } else {
    const ref = process.env.MUTATE_BASE;
    const io = ref ? gitIo(ref, process.cwd()) : undefined;
    process.stdout.write(await main(readFileSync(0, 'utf8'), readFileSync('stryker.config.json', 'utf8'), io));
  }
}
