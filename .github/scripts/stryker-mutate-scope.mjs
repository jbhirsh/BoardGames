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
// Usage: git diff --name-only ... | node .github/scripts/stryker-mutate-scope.mjs
// Prints the in-scope files, one per line (nothing when none are).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

/** The command's output for the changed files and the config's text. */
export function main(changed, configText) {
  const files = mutateScope(changed, JSON.parse(configText));
  return files.length > 0 ? `${files.join('\n')}\n` : '';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.stdout.write(main(readFileSync(0, 'utf8'), readFileSync('stryker.config.json', 'utf8')));
}
