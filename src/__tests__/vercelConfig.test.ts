import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

interface Rule {
  source: string;
  headers: { key: string; value: string }[];
}

const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf-8')) as {
  buildCommand?: string;
  headers?: Rule[];
  rewrites?: { source: string; destination: string }[];
  functions?: Record<string, { maxDuration?: number }>;
};
const cacheControl = (rule: Rule) => rule.headers.find((h) => h.key.toLowerCase() === 'cache-control')?.value;

describe('vercel.json build', () => {
  it("checks sign-in's settings and migrates the deploy's database once the app has built, before the deploy goes live, so a failed build or a missing setting migrates nothing", () => {
    expect(config.buildCommand).toBe('npm run build && node scripts/check-auth-env.ts && npm run db:migrate');
  });
});

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
    for (const path of ['/approve', '/deny']) expect(path).toMatch(source);
    for (const path of ['/', '/sign-in', '/rules/catan', '/approved']) expect(path).not.toMatch(source);
  });
});

describe('vercel.json rewrites', () => {
  it("sends sign-in to the one function, ahead of the app's pages", () => {
    expect(config.rewrites?.[0]).toEqual({ source: '/api/auth/:path*', destination: '/api/graphql' });
    const spa = config.rewrites?.find((rule) => rule.destination === '/index.html');
    const source = new RegExp(`^${spa?.source ?? '$^'}$`);
    for (const path of ['/sign-in', '/approve']) expect(path).toMatch(source);
    for (const path of ['/api/auth/callback/google', '/api/graphql']) expect(path).not.toMatch(source);
  });
});

describe('vercel.json functions', () => {
  it('gives every API function its own time limit, of at most 60 s', () => {
    // A file whose name starts with `_` is a module, never a function.
    const functions = readdirSync(join(process.cwd(), 'api'))
      .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
      .map((f) => `api/${f}`);
    expect(functions.length).toBeGreaterThan(0);
    for (const f of functions) {
      const limit = config.functions?.[f]?.maxDuration;
      expect(limit, f).toBeGreaterThan(0);
      expect(limit, f).toBeLessThanOrEqual(60);
    }
  });
});
