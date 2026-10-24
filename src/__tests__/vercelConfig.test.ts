import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

interface Rule {
  source: string;
  headers: { key: string; value: string }[];
}

interface Redirect {
  source: string;
  has?: { type: string; key: string; value?: string }[];
  destination: string;
  permanent?: boolean;
}

const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf-8')) as {
  headers?: Rule[];
  redirects?: Redirect[];
  functions?: Record<string, { maxDuration?: number }>;
};
const cacheControl = (rule: Rule) => rule.headers.find((h) => h.key.toLowerCase() === 'cache-control')?.value;

describe('vercel.json headers', () => {
  it("caches the build's hashed /assets for a year, never revalidated", () => {
    const assets = config.headers?.find((rule) => rule.source === '/assets/(.*)');
    expect(assets && cacheControl(assets)).toBe('public, max-age=31536000, immutable');
  });

  it("leaves every other path, the page and the service worker among them, to Vercel's revalidating default", () => {
    // index.html and sw.js keep their names across deploys, so any cache
    // rule reaching them could hold a visitor on an old build.
    const cached = (config.headers ?? []).filter((rule) => cacheControl(rule) !== undefined);
    expect(cached.map((rule) => rule.source)).toEqual(['/assets/(.*)']);
  });
});

describe('vercel.json referrers', () => {
  it("sends no referrer from the pages an emailed link opens, before the page's code has loaded", () => {
    const rule = config.headers?.find((r) => r.headers.some((h) => h.key === 'Referrer-Policy'));
    expect(rule?.headers).toEqual([{ key: 'Referrer-Policy', value: 'no-referrer' }]);
    const source = new RegExp(`^${rule?.source ?? '$^'}$`);
    for (const path of ['/approve', '/deny', '/sign-in/confirm']) expect(path).toMatch(source);
    for (const path of ['/', '/sign-in', '/rules/catan', '/approved']) expect(path).not.toMatch(source);
  });
});

describe('vercel.json redirects', () => {
  // The emails sent before the move to GraphQL link to the REST functions
  // it deleted (/api/suggestions?action=approve|deny&id&token, and
  // /api/auth?token); a link can sit unopened in an inbox for weeks. These
  // send each to the page that replaced it, which reads the same id, token
  // and game from the query Vercel passes through. Temporary, so a browser
  // doesn't remember them should /api/* ever answer those paths again; the
  // page still only reads until its button is pressed.
  const target = (path: string, query: Record<string, string>) =>
    config.redirects?.find(
      (r) =>
        r.source === path &&
        (r.has ?? []).every((h) => h.type === 'query' && h.key in query && (h.value ?? query[h.key]) === query[h.key]),
    );

  it('sends the old emailed approve, deny and sign-in links to the pages that replaced them', () => {
    expect(target('/api/suggestions', { action: 'approve', id: 'sug-1', token: 't' })?.destination).toBe('/approve');
    expect(target('/api/suggestions', { action: 'deny', id: 'sug-1', token: 't' })?.destination).toBe('/deny');
    expect(target('/api/auth', { token: 't' })?.destination).toBe('/sign-in/confirm');
  });

  it('redirects nothing else, and nothing permanently, adding no query of its own', () => {
    expect(target('/api/suggestions', { action: 'pending' })).toBeUndefined();
    expect(target('/api/suggestions', {})).toBeUndefined();
    expect(target('/api/auth', {})).toBeUndefined();
    expect(config.redirects?.map((r) => r.source)).toEqual(['/api/suggestions', '/api/suggestions', '/api/auth']);
    for (const r of config.redirects ?? []) {
      expect(r.permanent).toBe(false);
      expect(r.destination).not.toContain('?');
    }
  });
});

describe('vercel.json functions', () => {
  it('gives every API function its own time limit, of at most 60 s', () => {
    const functions = readdirSync(join(process.cwd(), 'api'))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => `api/${f}`);
    expect(functions.length).toBeGreaterThan(0);
    for (const f of functions) {
      const limit = config.functions?.[f]?.maxDuration;
      expect(limit, f).toBeGreaterThan(0);
      expect(limit, f).toBeLessThanOrEqual(60);
    }
  });
});
