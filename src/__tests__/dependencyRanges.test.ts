import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Every dependency takes a version range, never an exact version: the
 * lockfile already fixes what gets installed, and a pin only keeps
 * Dependabot's bumps (fixes included) out. A patch under patches/ doesn't
 * need one either: when a new release no longer takes the patch,
 * patch-package fails CI's install.
 */

// An exact version: 1.2.3, =1.2.3, v1.2.3, or one with a prerelease tag.
const EXACT = /^=?v?\d+\.\d+\.\d+(?:-[\w.]+)?$/;

/** The version part of a spec, after an `npm:name@` alias. */
function versionOf(spec: string): string {
  const alias = /^npm:(?:@[^/]+\/)?[^@]+@(.*)$/.exec(spec);
  return alias ? alias[1] : spec;
}

describe('package.json', () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as
    Record<string, Record<string, string> | undefined>;

  it('pins no dependency to an exact version', () => {
    const pinned = ['dependencies', 'devDependencies', 'optionalDependencies']
      .flatMap((field) => Object.entries(pkg[field] ?? {}))
      .filter(([, spec]) => EXACT.test(versionOf(spec)))
      .map(([name, spec]) => `${name}@${spec}`);
    expect(pinned).toEqual([]);
  });
});

describe('versionOf', () => {
  it('reads the version after an npm alias', () => {
    expect(versionOf('npm:typescript@7.0.2')).toBe('7.0.2');
    expect(versionOf('npm:@typescript/typescript6@^6.0.2')).toBe('^6.0.2');
    expect(versionOf('^1.2.3')).toBe('^1.2.3');
  });

  it('tells exact versions from ranges', () => {
    expect(['1.2.3', '=1.2.3', 'v1.2.3', '1.2.3-beta.1'].every((v) => EXACT.test(v))).toBe(true);
    expect(['^1.2.3', '~1.2.3', '>=1.2.3', '1.x', '*'].some((v) => EXACT.test(v))).toBe(false);
  });
});
