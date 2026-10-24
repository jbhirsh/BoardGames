import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

import * as Sentry from '@sentry/node';
import { clientIp, getLimiter, rateLimitRefusal, type RateLimiter } from '../../api/_lib/rateLimit';

const reqWith = (headers: Record<string, string | string[] | undefined>, remote?: string) => ({
  headers,
  socket: remote ? { remoteAddress: remote } : undefined,
});

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

describe('rateLimitRefusal', () => {
  beforeEach(() => vi.mocked(Sentry.captureException).mockClear());
  const throwing = (boom: Error): RateLimiter => ({
    limit: vi.fn(async () => {
      throw boom;
    }),
  });

  it('allows when the limiter is null (fail open), even failing closed', async () => {
    expect(await rateLimitRefusal(null, '1.1.1.1')).toBeNull();
    expect(await rateLimitRefusal(null, '1.1.1.1', { failClosed: true })).toBeNull();
  });

  it('counts against the key it is given and allows when the limiter reports success', async () => {
    const limiter: RateLimiter = { limit: vi.fn(async () => ({ success: true })) };
    expect(await rateLimitRefusal(limiter, '1.1.1.1')).toBeNull();
    expect(await rateLimitRefusal(limiter, 'global', { failClosed: true })).toBeNull();
    expect(limiter.limit).toHaveBeenNthCalledWith(1, '1.1.1.1');
    expect(limiter.limit).toHaveBeenNthCalledWith(2, 'global');
  });

  it('refuses with a 429 when the limiter reports failure, in its own words when given some', async () => {
    const limiter: RateLimiter = { limit: vi.fn(async () => ({ success: false })) };
    expect(await rateLimitRefusal(limiter, 'k')).toEqual({
      status: 429,
      error: 'Too many requests. Please slow down.',
    });
    const refusal = { error: 'Done for today.', code: 'DAILY_LIMIT' };
    expect(await rateLimitRefusal(limiter, 'k', { refusal })).toEqual({ status: 429, ...refusal });
  });

  it('fails open when the limiter throws, but reports it to Sentry', async () => {
    const boom = new Error('redis down');
    expect(await rateLimitRefusal(throwing(boom), 'k')).toBeNull();
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(boom);
  });

  it('fails closed with a 503 when asked to and the limiter throws, still reporting it', async () => {
    const boom = new Error('redis down');
    expect(await rateLimitRefusal(throwing(boom), 'k', { failClosed: true })).toEqual({
      status: 503,
      error: 'Temporarily unavailable. Please try again later.',
    });
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(boom);
  });

  it('treats an Upstash timeout as a failure only when failing closed', async () => {
    const limiter: RateLimiter = { limit: vi.fn(async () => ({ success: true, reason: 'timeout' })) };
    expect(await rateLimitRefusal(limiter, 'k', { failClosed: true })).toMatchObject({ status: 503 });
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(new Error('rate limiter timed out'));
    expect(await rateLimitRefusal(limiter, 'k')).toBeNull();
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

  it("keeps Upstash's 5 s timeout unless given a shorter one, which keys the memo too", () => {
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
