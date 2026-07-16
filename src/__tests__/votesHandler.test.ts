import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {},
}));

vi.mock('../../api/_lib/rateLimit.js', () => ({
  getLimiter: vi.fn(() => null),
  enforceRateLimit: vi.fn(async () => true),
}));

import handler from '../../api/votes';
import { enforceRateLimit } from '../../api/_lib/rateLimit.js';

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(data: unknown) { res.body = data; return res; },
  };
  return res;
}

function run(method: string, query: Record<string, unknown> = {}, body: unknown = {}) {
  const res = makeRes();
  const req = { method, query, body } as unknown as VercelRequest;
  return handler(req, res as unknown as VercelResponse).then(() => res);
}

describe('votes default handler rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(enforceRateLimit).mockResolvedValue(true);
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';
  });

  it('short-circuits with 429 and never reaches handleVotes when rate limited', async () => {
    vi.mocked(enforceRateLimit).mockImplementation(async (_l, _req, res) => {
      (res as unknown as { status(c: number): { json(b: unknown): void } }).status(429).json({ error: 'Too many requests. Please slow down.' });
      return false;
    });
    const res = await run('GET');
    // 429 can only come from the limiter — handleVotes returns 200/400/405.
    expect(res.statusCode).toBe(429);
  });

  it('proceeds to handleVotes when the limiter allows', async () => {
    const res = await run('GET'); // no ids → handleVotes returns its own 400
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'ids query parameter is required' });
  });
});
