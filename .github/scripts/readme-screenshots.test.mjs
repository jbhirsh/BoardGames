// @vitest-environment node
// A Node script's test: Node's environment, where import.meta.url is a file URL.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { THRESHOLD, changed, diffRatio, refresh } from './readme-screenshots.mjs';

/** A width×height PNG, white but for the first `dark` pixels, black. */
function png(width, height, dark = 0) {
  const image = new PNG({ width, height });
  image.data.fill(255);
  for (let i = 0; i < dark; i++) image.data.fill(0, i * 4, i * 4 + 3);
  return PNG.sync.write(image);
}

describe('diffRatio', () => {
  it('is the share of pixels that differ', () => {
    expect(diffRatio(png(10, 10), png(10, 10))).toBe(0);
    expect(diffRatio(png(10, 10), png(10, 10, 10))).toBeCloseTo(0.1);
  });

  it('is 1 when the sizes differ', () => {
    expect(diffRatio(png(10, 10), png(10, 11))).toBe(1);
  });
});

describe('changed', () => {
  it('replaces a missing, resized or visibly different screenshot', () => {
    expect(changed(null, png(10, 10))).toBe(true);
    expect(changed(png(10, 10), png(20, 10))).toBe(true);
    expect(changed(png(100, 100), png(100, 100, 100))).toBe(true);
  });

  it('keeps one within the threshold', () => {
    expect(THRESHOLD).toBe(0.005);
    expect(changed(png(100, 100), png(100, 100))).toBe(false);
    expect(changed(png(100, 100), png(100, 100, 50))).toBe(false);
    expect(changed(png(100, 100), png(100, 100, 51))).toBe(true);
  });
});

describe('refresh', () => {
  const dirs = [];
  const dir = () => {
    const d = mkdtempSync(join(tmpdir(), 'readme-shots-'));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('copies over only what changed, and names it', () => {
    const fresh = dir();
    const docs = dir();
    writeFileSync(join(fresh, 'same.png'), png(100, 100));
    writeFileSync(join(docs, 'same.png'), png(100, 100, 10));
    writeFileSync(join(fresh, 'moved.png'), png(100, 100, 2000));
    writeFileSync(join(docs, 'moved.png'), png(100, 100));
    writeFileSync(join(fresh, 'new.png'), png(10, 10));
    writeFileSync(join(fresh, 'notes.txt'), 'not a screenshot');

    expect(refresh(fresh, docs)).toEqual(['moved.png', 'new.png']);
    expect(readFileSync(join(docs, 'moved.png'))).toEqual(readFileSync(join(fresh, 'moved.png')));
    expect(readFileSync(join(docs, 'same.png'))).toEqual(png(100, 100, 10));
  });
});
