// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

// api/graphql.ts only wires the real services into the server; the server
// itself (createApi) is driven through graphqlApi.test.ts and the rest.
const yoga = vi.hoisted(() => ({
  calls: [] as Array<{ req: unknown; waitUntil: (work: Promise<void> | void) => void }>,
  deferred: undefined as Promise<void> | undefined,
}));

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  flush: vi.fn(async () => true),
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    readonly kind = 'redis';
  },
}));

vi.mock('../../api/_lib/rateLimit.js', async (importActual) => ({
  ...(await importActual<typeof import('../../api/_lib/rateLimit.js')>()),
  getLimiter: vi.fn(() => null),
}));

vi.mock('../../api/_resolvers/index.js', async (importActual) => ({
  ...(await importActual<typeof import('../../api/_resolvers/index.js')>()),
  createApi: vi.fn(() =>
    vi.fn(async (req: unknown, _res: unknown, ctx: { waitUntil: (work: Promise<void> | void) => void }) => {
      yoga.calls.push({ req, waitUntil: ctx.waitUntil });
      if (yoga.deferred) ctx.waitUntil(yoga.deferred);
    }),
  ),
}));

import handler from '../../api/graphql';
import { getLimiter } from '../../api/_lib/rateLimit.js';
import { createApi } from '../../api/_resolvers/index.js';
import type { ApiDeps } from '../../api/_resolvers/context';

// Read before any test clears the mocks: the function builds them on import.
const limiterCalls = vi.mocked(getLimiter).mock.calls.map((call) => [...call]);
const getDeps = vi.mocked(createApi).mock.calls[0][0] as () => ApiDeps;

function nodeRes() {
  const res = {
    status: 0,
    headers: {} as Record<string, unknown>,
    body: '',
    writeHead(status: number, headers: Record<string, unknown>) {
      res.status = status;
      res.headers = headers;
      return res;
    },
    end(body: string) {
      res.body = body;
      return res;
    },
  };
  return res;
}

const call = (method: string, headers: Record<string, string> = {}) => {
  const res = nodeRes();
  return handler({ method, headers } as IncomingMessage, res as unknown as ServerResponse).then(() => res);
};

describe('api/graphql.ts', () => {
  beforeEach(() => {
    yoga.calls = [];
    yoga.deferred = undefined;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps each per-IP budget, and one daily chat budget of 500 with a short Redis timeout', () => {
    expect(limiterCalls).toEqual(
      expect.arrayContaining([
        ['votes', 30, 60],
        ['auth', 5, 3600],
        ['suggestions', 5, 3600],
        ['chat', 10, 60],
        ['chat-global', 500, 86400, { timeoutMs: 2000 }],
      ]),
    );
  });

  it('refuses a POST that arrived as anything but JSON, before Yoga sees it', async () => {
    for (const type of ['application/x-www-form-urlencoded', 'text/plain', '']) {
      const res = await call('POST', type ? { 'content-type': type } : {});
      expect(res.status).toBe(415);
      expect(JSON.parse(res.body)).toEqual({ errors: [{ message: 'Requests must be sent as JSON' }] });
    }
    expect(yoga.calls).toEqual([]);
  });

  it("answers a malformed JSON body with a 400, not the parser's stack", async () => {
    const res = nodeRes();
    const req = { method: 'POST', headers: { 'content-type': 'application/json' } };
    // Vercel's lazy body: parsing a malformed body throws when it is read.
    Object.defineProperty(req, 'body', {
      get() {
        throw new SyntaxError('Unexpected token b in JSON at position 1');
      },
    });
    await handler(req as IncomingMessage, res as unknown as ServerResponse);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ errors: [{ message: 'Requests must be valid JSON' }] });
    expect(res.body).not.toContain('SyntaxError');
    expect(yoga.calls).toEqual([]);
  });

  it('hands JSON POSTs and GETs to Yoga', async () => {
    await call('POST', { 'content-type': 'application/json; charset=utf-8' });
    await call('GET');
    expect(yoga.calls).toHaveLength(2);
  });

  it('resolves only once the work left running after the answer is done', async () => {
    let finish = () => {};
    yoga.deferred = new Promise<void>((resolve) => (finish = resolve));
    let done = false;
    const pending = call('POST', { 'content-type': 'application/json' }).then(() => (done = true));
    await vi.waitFor(() => expect(yoga.calls).toHaveLength(1));
    yoga.calls[0].waitUntil(undefined);
    await Promise.resolve();
    expect(done).toBe(false);
    finish();
    await pending;
    expect(done).toBe(true);
  });

  it('builds the services once, from the environment', () => {
    vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
    vi.stubEnv('KV_REST_API_TOKEN', 'test-token');
    vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
    vi.stubEnv('SUGGESTIONS_TO', 'jess@example.com');
    vi.stubEnv('RESEND_API_KEY', '');
    const deps = getDeps();
    expect(getDeps()).toBe(deps);
    expect(deps.chat.apiKey).toBe('gemini-key');
    expect(deps.auth.ownerEmail).toBe('jess@example.com');
    expect(deps.auth.mailer).toBeNull();
    expect(deps.suggestions.lookup).toEqual(expect.any(Function));
    expect(deps.limiters).toEqual({ votes: null, signInLink: null, suggest: null });
  });
});

describe('api/graphql.ts with no KV config (no daily cap)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadFresh(env: string) {
    vi.stubEnv('VERCEL_ENV', env);
    vi.resetModules();
    const sentry = await import('@sentry/node');
    vi.mocked(sentry.captureMessage).mockClear();
    await import('../../api/graphql');
    return sentry;
  }

  it('warns Sentry in production that the cap is off', async () => {
    const sentry = await loadFresh('production');
    expect(sentry.captureMessage).toHaveBeenCalledWith('chat daily cap disabled: KV env missing', 'warning');
  });

  it('stays quiet outside production', async () => {
    const sentry = await loadFresh('preview');
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});
