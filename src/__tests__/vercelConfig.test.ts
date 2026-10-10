import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

interface Rule { source: string; headers: { key: string; value: string }[] }

const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf-8')) as { headers?: Rule[] };
const cacheControl = (rule: Rule) => rule.headers.find((h) => h.key.toLowerCase() === 'cache-control')?.value;

describe('vercel.json headers', () => {
  it('caches the build\'s hashed /assets for a year, never revalidated', () => {
    const assets = config.headers?.find((rule) => rule.source === '/assets/(.*)');
    expect(assets && cacheControl(assets)).toBe('public, max-age=31536000, immutable');
  });

  it('leaves every other path, the page and the service worker among them, to Vercel\'s revalidating default', () => {
    // index.html and sw.js keep their names across deploys, so any cache
    // rule reaching them could hold a visitor on an old build.
    const cached = (config.headers ?? []).filter((rule) => cacheControl(rule) !== undefined);
    expect(cached.map((rule) => rule.source)).toEqual(['/assets/(.*)']);
  });
});
