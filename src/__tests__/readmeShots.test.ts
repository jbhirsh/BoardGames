import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// The README's pictures are retaken by e2e/readme.shots.ts once a UI change
// reaches main (readme-screenshots.yml), each named for the file it writes
// to docs/screenshots/. A picture the README gains without a shot there would
// never be refreshed, and a shot the README dropped would be retaken for
// nothing, so the two lists must match.
const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf-8');

const linked = (readme: string) =>
  [...new Set([...readme.matchAll(/docs\/screenshots\/([\w-]+)\.png/g)].map((m) => m[1]))].sort();

const taken = (spec: string) => [...spec.matchAll(/shot\(page, '([\w-]+)'\)/g)].map((m) => m[1]).sort();

describe('the README screenshots', () => {
  it('are exactly the shots e2e/readme.shots.ts takes', () => {
    const shots = taken(read('e2e/readme.shots.ts'));
    expect(shots.length).toBeGreaterThan(0);
    expect(linked(read('README.md'))).toEqual(shots);
  });

  it('read both lists the way the files write them', () => {
    expect(linked('![a](docs/screenshots/b-c.png) ![d](docs/screenshots/b-c.png) docs/other.png')).toEqual(['b-c']);
    expect(taken("await shot(page, 'z');\nawait shot(page, 'a-b');")).toEqual(['a-b', 'z']);
  });
});
