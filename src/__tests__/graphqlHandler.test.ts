// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

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

// Better Auth (api/_auth.ts) as a handler of the test's own: what reaches
// it, and how the function answers when it throws.
const signIn = vi.hoisted(() => ({
  requests: [] as Request[],
  fail: undefined as Error | undefined,
}));

vi.mock('../../api/_auth.js', () => ({
  auth: vi.fn(async () => {
    if (signIn.fail) throw signIn.fail;
    return {
      handler: async (request: Request) => {
        signIn.requests.push(request);
        return Response.json({ ok: true }, { headers: { 'set-cookie': 'a=1; Path=/' } });
      },
    };
  }),
  ownerSessionReader: vi.fn(() => vi.fn(async () => ({ owner: false }))),
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
    expect(deps.suggestions.mailer).toBeNull();
    expect(deps.suggestions.lookup).toEqual(expect.any(Function));
    expect(deps.limiters).toEqual({ votes: null, suggest: null });
    expect(deps.ownerSession).toEqual(expect.any(Function));
  });
});

/** A Node response as Better Auth's adapter writes one. */
function streamRes() {
  const res = {
    statusCode: 0,
    headersSent: false,
    destroyed: false,
    headers: {} as Record<string, unknown>,
    body: '',
    setHeader(name: string, value: unknown) {
      res.headers[name] = value;
    },
    getHeaderNames: () => Object.keys(res.headers),
    removeHeader(name: string) {
      delete res.headers[name];
    },
    writeHead(status: number, headers: Record<string, unknown> = {}) {
      res.statusCode = status;
      Object.assign(res.headers, headers);
      res.headersSent = true;
      return res;
    },
    write(chunk: Uint8Array) {
      res.body += new TextDecoder().decode(chunk);
      return true;
    },
    end(chunk?: string) {
      if (chunk) res.body += chunk;
      res.headersSent = true;
      return res;
    },
    on: () => res,
    off: () => res,
    once: () => res,
  };
  return res;
}

/** A request for Better Auth, as Vercel hands it over: its path as it arrived, and a body to read. */
function authReq(method: string, url: string, headers: Record<string, string>, body?: string) {
  const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(body)]), {
    method,
    url,
    headers: { host: 'games.example', 'x-forwarded-proto': 'https', ...headers },
    socket: {},
  });
  return req as unknown as IncomingMessage;
}

describe('api/graphql.ts at /api/auth/*', () => {
  beforeEach(() => {
    yoga.calls = [];
    signIn.requests = [];
    signIn.fail = undefined;
  });

  it("hands Better Auth a GET (Google's return), past the JSON-only gate", async () => {
    const res = streamRes();
    await handler(authReq('GET', '/api/auth/callback/google?code=c&state=s', {}), res as unknown as ServerResponse);
    await vi.waitFor(() => expect(res.body).toBe('{"ok":true}'));
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toEqual(['a=1; Path=/']);
    expect(signIn.requests.map((r) => [r.method, r.url])).toEqual([
      ['GET', 'https://games.example/api/auth/callback/google?code=c&state=s'],
    ]);
    expect(yoga.calls).toEqual([]);
  });

  it("hands it a POST that isn't JSON, with its body, which Yoga would refuse", async () => {
    const res = streamRes();
    const req = authReq('POST', '/api/auth/sign-out', { 'content-type': 'text/plain' }, 'hello');
    await handler(req, res as unknown as ServerResponse);
    await vi.waitFor(() => expect(res.statusCode).toBe(200));
    expect(await signIn.requests[0].text()).toBe('hello');
    expect(yoga.calls).toEqual([]);
  });

  it('answers a throw with a plain error, and reports it', async () => {
    const sentry = await import('@sentry/node');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    signIn.fail = new Error('BETTER_AUTH_SECRET not set');
    const res = streamRes();
    await handler(authReq('GET', '/api/auth/ok', {}), res as unknown as ServerResponse);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ message: 'Sign-in failed' });
    expect(sentry.captureException).toHaveBeenCalledWith(signIn.fail);
  });

  it("answers a body Vercel can't parse with a plain 400, unreported, never the parser's stack", async () => {
    const sentry = await import('@sentry/node');
    vi.mocked(sentry.captureException).mockClear();
    const res = streamRes();
    // Read already, as Vercel's helpers read it: only the lazy getter is left.
    const req = authReq('POST', '/api/auth/sign-out', { 'content-type': 'application/json' });
    (req as unknown as Readable).destroy();
    Object.defineProperty(req, 'body', {
      get() {
        throw new SyntaxError('Unexpected token b in JSON at position 1');
      },
    });
    await handler(req, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ errors: [{ message: 'Requests must be valid JSON' }] });
    expect(res.body).not.toContain('SyntaxError');
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(signIn.requests).toEqual([]);
  });

  it('keeps the JSON-only gate for everything else, /api/authx included', async () => {
    const res = streamRes();
    await handler(
      authReq('POST', '/api/authx/sign-out', { 'content-type': 'text/plain' }),
      res as unknown as ServerResponse,
    );
    expect(res.statusCode).toBe(415);
    expect(signIn.requests).toEqual([]);
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
