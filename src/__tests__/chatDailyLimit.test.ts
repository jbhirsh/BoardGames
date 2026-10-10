import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// The limiters' Redis, faked in memory: each (prefix, key) bucket allows its
// budget and, like Upstash, doesn't count a refused request. A prefix in
// `down` makes that limiter's limit() calls throw, as an unreachable Redis does.
const redis = vi.hoisted(() => ({ down: new Set<string>(), counts: new Map<string, number>() }));
const ALL_LIMITERS = ['chat', 'chat-global', 'votes', 'suggestions', 'auth'];

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {},
}));

vi.mock('../../api/_lib/rulesAssistant.js', () => ({
  loadRulesText: vi.fn(() => 'the rules'),
  otherRulebooks: vi.fn(() => []),
  otherRulebooksNote: vi.fn(() => ''),
  streamRulesAnswer: vi.fn(),
  RULES_ASSISTANT_MAX_OUTPUT_TOKENS: 1024,
}));

vi.mock('../../api/_lib/rateLimit.js', async (importActual) => ({
  ...(await importActual<typeof import('../../api/_lib/rateLimit.js')>()),
  getLimiter: vi.fn((prefix: string, requests: number) => ({
    async limit(key: string) {
      if (redis.down.has(prefix)) throw new Error('redis down');
      const bucket = `${prefix}:${key}`;
      const used = redis.counts.get(bucket) ?? 0;
      if (used >= requests) return { success: false };
      redis.counts.set(bucket, used + 1);
      return { success: true };
    },
  })),
}));

import chat from '../../api/chat';
import votes from '../../api/votes';
import suggestions from '../../api/suggestions';
import auth from '../../api/auth';
import { getLimiter } from '../../api/_lib/rateLimit.js';
import { loadRulesText, streamRulesAnswer } from '../../api/_lib/rulesAssistant.js';

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(data: unknown) { res.body = data; return res; },
    send(data: unknown) { res.body = data; return res; },
    setHeader() {},
    write() {},
    end() {},
  };
  return res;
}

async function call(handler: Handler, ip: string, method: string, body: unknown = {}, query: Record<string, unknown> = {}) {
  const res = makeRes();
  const req = { method, body, query, headers: { 'x-real-ip': ip } } as unknown as VercelRequest;
  await handler(req, res as unknown as VercelResponse);
  return res;
}

const ask = (ip: string) => call(chat, ip, 'POST', { slug: 'catan', message: 'How many players?' });

async function* answer() {
  yield { text: 'Three or four.' };
}

// Read before any test clears the mocks: the handlers build their limiters on import.
const dailyBudget = vi.mocked(getLimiter).mock.calls.find(([prefix]) => prefix === 'chat-global');

describe('the rules assistant daily cap', () => {
  beforeEach(() => {
    redis.down.clear();
    redis.counts.clear();
    vi.mocked(streamRulesAnswer).mockClear();
    vi.mocked(streamRulesAnswer).mockImplementation(
      async () => answer() as unknown as Awaited<ReturnType<typeof streamRulesAnswer>>,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is one budget of 500 a day shared by every caller, with a short Redis timeout', () => {
    expect(dailyBudget).toEqual(['chat-global', 500, 86400, { timeoutMs: 2000 }]);
  });

  it('trips after the budget is spent, across different IPs', async () => {
    for (let i = 0; i < 500; i++) {
      expect((await ask(`10.0.${i >> 8}.${i & 255}`)).statusCode).toBe(0); // streamed, no status set
    }
    const res = await ask('192.168.1.1');
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({
      error: 'The rules assistant has reached its limit for today. The rulebook still works.',
      code: 'daily-limit',
    });
    expect(streamRulesAnswer).toHaveBeenCalledTimes(500);
  });

  it('still limits each IP per minute, and those refusals spend none of the daily budget', async () => {
    for (let i = 0; i < 10; i++) expect((await ask('1.2.3.4')).statusCode).toBe(0);
    const res = await ask('1.2.3.4');
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'Too many requests. Please slow down.' });
    expect(redis.counts.get('chat-global:global')).toBe(10);
    expect((await ask('5.6.7.8')).statusCode).toBe(0);
  });

  it('spends none of the budget on a malformed request', async () => {
    expect((await call(chat, '1.2.3.4', 'POST', { slug: 'catan', message: '' })).statusCode).toBe(400);
    expect(redis.counts.has('chat-global:global')).toBe(false);
  });

  it('spends none of the budget on a game with no rules', async () => {
    vi.mocked(loadRulesText).mockImplementationOnce(() => { throw new Error('ENOENT'); });
    expect((await ask('1.2.3.4')).statusCode).toBe(404);
    expect(redis.counts.has('chat-global:global')).toBe(false);
  });

  it('refuses chat when Redis is down, without asking Gemini', async () => {
    ALL_LIMITERS.forEach((p) => redis.down.add(p));
    const res = await ask('1.2.3.4');
    expect(res.statusCode).toBe(503);
    expect(streamRulesAnswer).not.toHaveBeenCalled();
  });

  it('fails open at the per-IP check, leaving the daily check to refuse', async () => {
    redis.down.add('chat');
    expect((await ask('1.2.3.4')).statusCode).toBe(0);
    expect(streamRulesAnswer).toHaveBeenCalledTimes(1);
  });

  it('fails closed at the daily check, even when the per-IP check answered', async () => {
    redis.down.add('chat-global');
    expect((await ask('1.2.3.4')).statusCode).toBe(503);
    expect(streamRulesAnswer).not.toHaveBeenCalled();
  });

  it('lets votes, suggestions and sign-in through when Redis is down', async () => {
    ALL_LIMITERS.forEach((p) => redis.down.add(p));
    vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
    vi.stubEnv('KV_REST_API_TOKEN', 'test-token');
    vi.stubEnv('RESEND_API_KEY', undefined);
    vi.stubEnv('SUGGESTIONS_TO', undefined);
    // Each answer is the handler's own, past the limiter.
    expect((await call(votes, '1.2.3.4', 'GET')).body).toEqual({ error: 'ids query parameter is required' });
    expect((await call(suggestions, '1.2.3.4', 'POST', { game: 'Azul' })).body).toEqual({ error: 'Suggestions are not open yet' });
    expect((await call(auth, '1.2.3.4', 'POST', { email: 'a@b.c' })).body).toEqual({ error: 'Sign-in is not set up yet' });
  });
});
