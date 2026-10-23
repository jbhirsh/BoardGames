// Replaces the README's screenshots that changed (readme-screenshots.yml).
// e2e/readme.shots.ts writes fresh ones to readme-shots/; each replaces its
// namesake in docs/screenshots/ only when it's new, a different size, or
// more than THRESHOLD of its pixels differ, so anti-aliasing noise between
// runs never opens a PR. Prints the names it replaced, one per line.
//
// Usage: node .github/scripts/readme-screenshots.mjs <fresh dir> <docs dir>
import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export const THRESHOLD = 0.005;

/**
 * The share of pixels that differ between two PNGs (1 when their sizes
 * differ), anti-aliasing aside.
 * @param {Buffer} before
 * @param {Buffer} after
 */
export function diffRatio(before, after) {
  const a = PNG.sync.read(before);
  const b = PNG.sync.read(after);
  if (a.width !== b.width || a.height !== b.height) return 1;
  return pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 }) / (a.width * a.height);
}

/**
 * Whether a fresh screenshot should replace the one there (null: none yet).
 * @param {Buffer | null} before
 * @param {Buffer} after
 */
export function changed(before, after) {
  return before === null || diffRatio(before, after) > THRESHOLD;
}

/**
 * Copies each changed screenshot over, and returns their names.
 * @param {string} fresh
 * @param {string} docs
 */
export function refresh(fresh, docs) {
  const replaced = [];
  for (const name of readdirSync(fresh)
    .filter((f) => f.endsWith('.png'))
    .sort()) {
    const target = join(docs, name);
    const before = existsSync(target) ? readFileSync(target) : null;
    if (!changed(before, readFileSync(join(fresh, name)))) continue;
    copyFileSync(join(fresh, name), target);
    replaced.push(name);
  }
  return replaced;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [fresh, docs] = process.argv.slice(2);
  if (!fresh || !docs) throw new Error('usage: node .github/scripts/readme-screenshots.mjs <fresh dir> <docs dir>');
  for (const name of refresh(fresh, docs)) console.log(name);
}
