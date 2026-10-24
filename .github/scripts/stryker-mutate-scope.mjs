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
// Usage: git diff --name-only ... | MUTATE_BASE=origin/main node .github/scripts/stryker-mutate-scope.mjs
// Prints the in-scope files, one per line (nothing when none are). Without
// MUTATE_BASE, no file is checked for a formatting-only change.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as prettier from 'prettier';

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
 * Reads files from git at the merge base of `ref` and HEAD, and from the
 * working tree, run in `cwd`.
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
  };
}

/**
 * The command's output for the changed files and the config's text; with
 * `io`, files changed only in formatting are left out.
 */
export async function main(changed, configText, io) {
  const inScope = mutateScope(changed, JSON.parse(configText));
  const files = io ? await substantive(inScope, io) : inScope;
  return files.length > 0 ? `${files.join('\n')}\n` : '';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const ref = process.env.MUTATE_BASE;
  const io = ref ? gitIo(ref, process.cwd()) : undefined;
  process.stdout.write(await main(readFileSync(0, 'utf8'), readFileSync('stryker.config.json', 'utf8'), io));
}
