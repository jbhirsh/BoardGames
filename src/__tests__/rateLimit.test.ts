// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

import * as Sentry from '@sentry/node';
import { clientIp, counterLimiter, getLimiter, rateLimitRefusal, type RateLimiter } from '../../api/_lib/rateLimit';
import { testDb, type TestDb } from './helpers/testDb';

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
    expect(limiter.limit).toHaveBeenNthCalledWith(1, '1.1.1.1', undefined);
    expect(limiter.limit).toHaveBeenNthCalledWith(2, 'global', undefined);
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
    const boom = new Error('database down');
    expect(await rateLimitRefusal(throwing(boom), 'k')).toBeNull();
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(boom);
  });

  it('fails closed with a 503 when asked to and the limiter throws, still reporting it', async () => {
    const boom = new Error('database down');
    expect(await rateLimitRefusal(throwing(boom), 'k', { failClosed: true })).toEqual({
      status: 503,
      error: 'Temporarily unavailable. Please try again later.',
    });
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(boom);
  });

  it("passes the request's defer on to the limiter, for its sweep", async () => {
    const limiter: RateLimiter = { limit: vi.fn(async () => ({ success: true })) };
    const defer = vi.fn();
    await rateLimitRefusal(limiter, 'k', { defer });
    expect(limiter.limit).toHaveBeenCalledWith('k', defer);
  });
});

describe('counterLimiter', () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await testDb();
  });
  afterEach(() => db.close());

  const DAY = 86_400_000;
  const rows = () =>
    db.db.all<{ key: string; window_start: number; count: number; expires_at: number }>(
      sql`SELECT * FROM rate_limits ORDER BY key, window_start`,
    );

  it('allows up to the limit in a window, then refuses, counting each key apart', async () => {
    const limiter = counterLimiter(async () => db.db, 'votes', 2, 60, { now: () => 61_000, sweep: () => false });
    expect(await limiter.limit('1.1.1.1')).toEqual({ success: true });
    expect(await limiter.limit('1.1.1.1')).toEqual({ success: true });
    expect(await limiter.limit('1.1.1.1')).toEqual({ success: false });
    expect(await limiter.limit('2.2.2.2')).toEqual({ success: true });
    expect(await rows()).toEqual([
      { key: 'votes:1.1.1.1', window_start: 60_000, count: 3, expires_at: 120_000 },
      { key: 'votes:2.2.2.2', window_start: 60_000, count: 1, expires_at: 120_000 },
    ]);
  });

  it('starts a fresh count when the fixed window turns over, a UTC day for a daily limit', async () => {
    let at = 2 * DAY - 1;
    const limiter = counterLimiter(async () => db.db, 'chat-global', 1, 86_400, { now: () => at, sweep: () => false });
    expect(await limiter.limit('global')).toEqual({ success: true });
    expect(await limiter.limit('global')).toEqual({ success: false });
    at = 2 * DAY;
    expect(await limiter.limit('global')).toEqual({ success: true });
    expect((await rows()).map((r) => r.window_start)).toEqual([DAY, 2 * DAY]);
  });

  it('sweeps expired rows after the answer, only when the request can defer it and the dice say so', async () => {
    let at = 0;
    let sweep = false;
    const limiter = counterLimiter(async () => db.db, 'votes', 5, 60, { now: () => at, sweep: () => sweep });
    await limiter.limit('a');
    at = 120_001;
    const deferred: Promise<void>[] = [];
    const defer = (work: Promise<void>) => void deferred.push(work);
    await limiter.limit('b', defer);
    expect(deferred).toHaveLength(0);
    sweep = true;
    await limiter.limit('b');
    expect((await rows()).map((r) => r.key)).toEqual(['votes:a', 'votes:b']);
    await limiter.limit('b', defer);
    await Promise.all(deferred);
    expect((await rows()).map((r) => r.key)).toEqual(['votes:b']);
  });

  it('throws when the database does not answer in time, so a fail-closed caller refuses', async () => {
    vi.useFakeTimers();
    const limiter = counterLimiter(() => new Promise<never>(() => {}), 'chat-global', 5, 86_400, { timeoutMs: 2000 });
    const refused = rateLimitRefusal(limiter, 'global', { failClosed: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await refused).toMatchObject({ status: 503 });
    vi.useRealTimers();
  });

  it('throws what the database throws, which a fail-open caller lets through', async () => {
    const limiter = counterLimiter(() => Promise.reject(new Error('no database configured')), 'votes', 5, 60);
    expect(await rateLimitRefusal(limiter, 'k')).toBeNull();
    expect(await rateLimitRefusal(limiter, 'k', { failClosed: true })).toMatchObject({ status: 503 });
  });
});

describe('getLimiter', () => {
  it('returns null with no database configured outside production, so callers fail open', () => {
    expect(getLimiter('test-absent', 10, 60, {}, {})).toBeNull();
    expect(getLimiter('test-preview', 10, 60, {}, { VERCEL_ENV: 'preview' })).toBeNull();
  });

  it('builds a limiter for a configured database, and a fail-closed one in production even without one', () => {
    expect(typeof getLimiter('test-present', 10, 60, {}, { DEV_DB_PATH: '/tmp/x.db' })?.limit).toBe('function');
    expect(getLimiter('test-production', 10, 60, { failClosed: true }, { VERCEL_ENV: 'production' })).not.toBeNull();
    // A fail-open one has nothing to refuse, so none is built.
    expect(getLimiter('test-production-open', 10, 60, {}, { VERCEL_ENV: 'production' })).toBeNull();
  });

  it('memoizes per (prefix, budget): same budget reuses, different budget does not', () => {
    const env = { DEV_DB_PATH: '/tmp/x.db' };
    const a = getLimiter('test-memo', 10, 60, {}, env);
    expect(getLimiter('test-memo', 10, 60, {}, env)).toBe(a);
    expect(getLimiter('test-memo', 99, 1, {}, env)).not.toBe(a);
    expect(getLimiter('test-memo', 10, 60, { timeoutMs: 2000 }, env)).not.toBe(a);
  });
});
