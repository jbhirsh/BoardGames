import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

import * as Sentry from '@sentry/node';
import { clientIp, enforceRateLimit, getLimiter, type RateLimiter } from '../../api/_lib/rateLimit';

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status: vi.fn((code: number) => { res.statusCode = code; return res; }),
    json: vi.fn((data: unknown) => { res.body = data; return res; }),
  };
  return res;
}

const reqWith = (headers: Record<string, string | string[] | undefined>, remote?: string) =>
  ({ headers, socket: remote ? { remoteAddress: remote } : undefined });

describe('clientIp', () => {
  it('prefers x-real-ip (the value Vercel sets and the client cannot spoof)', () => {
    expect(clientIp(reqWith({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('9.9.9.9');
  });

  it('takes the LAST (trusted) hop of x-forwarded-for, not the client-most first', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('5.6.7.8');
  });

  it('handles the array header form by taking the last entry', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': ['9.9.9.9', '8.8.8.8'] }))).toBe('8.8.8.8');
  });

  it('falls back to socket remoteAddress, then to "unknown"', () => {
    expect(clientIp(reqWith({}, '10.0.0.1'))).toBe('10.0.0.1');
    expect(clientIp(reqWith({}))).toBe('unknown');
  });
});

describe('enforceRateLimit', () => {
  beforeEach(() => vi.mocked(Sentry.captureException).mockClear());

  it('allows and writes nothing when the limiter is null (fail open)', async () => {
    const res = makeRes();
    const ok = await enforceRateLimit(null, reqWith({}), res);
    expect(ok).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows when the limiter reports success', async () => {
    const res = makeRes();
    const limiter: RateLimiter = { limit: vi.fn(async () => ({ success: true })) };
    expect(await enforceRateLimit(limiter, reqWith({ 'x-forwarded-for': '1.1.1.1' }), res)).toBe(true);
    expect(limiter.limit).toHaveBeenCalledWith('1.1.1.1');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks with 429 when the limiter reports failure', async () => {
    const res = makeRes();
    const limiter: RateLimiter = { limit: vi.fn(async () => ({ success: false })) };
    expect(await enforceRateLimit(limiter, reqWith({}), res)).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'Too many requests. Please slow down.' });
  });

  it('fails open when the limiter throws, but reports it to Sentry', async () => {
    const res = makeRes();
    const boom = new Error('redis down');
    const limiter: RateLimiter = { limit: vi.fn(async () => { throw boom; }) };
    expect(await enforceRateLimit(limiter, reqWith({}), res)).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(boom);
  });

  it('counts against a fixed key when given one, instead of the client IP', async () => {
    const limiter: RateLimiter = { limit: vi.fn(async () => ({ success: true })) };
    await enforceRateLimit(limiter, reqWith({ 'x-real-ip': '1.1.1.1' }), makeRes(), { key: 'global' });
    expect(limiter.limit).toHaveBeenCalledWith('global');
  });

  it('answers a 429 with the caller\'s own refusal when given one', async () => {
    const res = makeRes();
    const limiter: RateLimiter = { limit: vi.fn(async () => ({ success: false })) };
    const refusal = { error: 'Done for today.', code: 'daily-limit' };
    expect(await enforceRateLimit(limiter, reqWith({}), res, { refusal })).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual(refusal);
  });

  it('fails closed with a 503 when asked to and the limiter throws, still reporting it', async () => {
    const res = makeRes();
    const boom = new Error('redis down');
    const limiter: RateLimiter = { limit: vi.fn(async () => { throw boom; }) };
    expect(await enforceRateLimit(limiter, reqWith({}), res, { failClosed: true })).toBe(false);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Temporarily unavailable. Please try again later.' });
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(boom);
  });

  it('treats an Upstash timeout as a failure when failing closed', async () => {
    const res = makeRes();
    const limiter: RateLimiter = { limit: vi.fn(async () => ({ success: true, reason: 'timeout' })) };
    expect(await enforceRateLimit(limiter, reqWith({}), res, { failClosed: true })).toBe(false);
    expect(res.statusCode).toBe(503);
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(new Error('rate limiter timed out'));
  });

  it('lets an Upstash timeout through when failing open', async () => {
    const res = makeRes();
    const limiter: RateLimiter = { limit: vi.fn(async () => ({ success: true, reason: 'timeout' })) };
    expect(await enforceRateLimit(limiter, reqWith({}), res)).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows a fail-closed request when no limiter is configured (no Redis env)', async () => {
    const res = makeRes();
    expect(await enforceRateLimit(null, reqWith({}), res, { failClosed: true })).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows a fail-closed request the limiter passes', async () => {
    const res = makeRes();
    const limiter: RateLimiter = { limit: vi.fn(async () => ({ success: true })) };
    expect(await enforceRateLimit(limiter, reqWith({}), res, { failClosed: true })).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('getLimiter', () => {
  const saved = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  afterEach(() => {
    process.env.KV_REST_API_URL = saved.url;
    process.env.KV_REST_API_TOKEN = saved.token;
  });

  it('returns null when the Upstash env vars are absent', () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    expect(getLimiter('test-absent', 10, 60)).toBeNull();
  });

  it('builds a limiter when the env vars are present', () => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';
    const limiter = getLimiter('test-present', 10, 60);
    expect(limiter).not.toBeNull();
    expect(typeof limiter!.limit).toBe('function');
  });

  it('memoizes per (prefix, budget): same budget reuses, different budget does not', () => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';
    const a = getLimiter('test-memo', 10, 60);
    expect(getLimiter('test-memo', 10, 60)).toBe(a);
    expect(getLimiter('test-memo', 99, 1)).not.toBe(a);
  });

  it('keeps Upstash\'s 5 s timeout unless given a shorter one, which keys the memo too', () => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';
    const timeoutOf = (l: RateLimiter | null) => (l as unknown as { timeout: number }).timeout;
    const plain = getLimiter('test-timeout', 10, 60);
    const quick = getLimiter('test-timeout', 10, 60, { timeoutMs: 2000 });
    expect(timeoutOf(plain)).toBe(5000);
    expect(timeoutOf(quick)).toBe(2000);
    expect(quick).not.toBe(plain);
  });
});
