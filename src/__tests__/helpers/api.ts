import { vi } from 'vitest';
import { createApi } from '../../../api/_resolvers/index';
import type { ApiDeps } from '../../../api/_resolvers/context';
import type { Mail } from '../../../api/_lib/mail';
import type { RateLimiter } from '../../../api/_lib/rateLimit';
import { fakeRedis } from './fakeRedis';

/** A GraphQL error as the API sends it. */
export interface GqlError {
  message: string;
  extensions?: { code?: string; status?: string };
}

/** One answer from the API: its HTTP status, `data` and `errors`, and its headers. */
interface GqlAnswer {
  status: number;
  data: Record<string, unknown> | null;
  errors: GqlError[];
  headers: Headers;
}

/** The test's whole API: every dependency a fake, each one open to change. */
export interface TestApi {
  deps: ApiDeps;
  redis: ReturnType<typeof fakeRedis>;
  rawRedis: ReturnType<typeof fakeRedis>;
  sent: Mail[];
  /** Work the API left running after an answer (the sign-in email). */
  deferred: Promise<unknown>[];
  /** POSTs one operation as JSON (or as `contentType`), with the session cookie when `cookie` is given. */
  run(query: string, variables?: Record<string, unknown>, init?: RunInit): Promise<GqlAnswer>;
  /** Sends a raw request, for what the API does with one that isn't a JSON POST. */
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

interface RunInit {
  cookie?: string;
  contentType?: string;
  ip?: string;
  accept?: string;
}

/** A limiter that refuses every request. */
export const refusing = (): RateLimiter => ({ limit: vi.fn(async () => ({ success: false })) });

export function testApi(over: (deps: ApiDeps) => Partial<ApiDeps> = () => ({})): TestApi {
  const redis = fakeRedis();
  const rawRedis = fakeRedis({ raw: true });
  const sent: Mail[] = [];
  const deferred: Promise<unknown>[] = [];
  const mailer = {
    send: vi.fn(async (m: Mail) => {
      sent.push(m);
    }),
  };
  const base: ApiDeps = {
    redis,
    suggestions: {
      redis: rawRedis,
      mailer,
      baseUrl: () => 'https://games.example',
      lookup: null,
      now: () => 5000,
      randomId: () => 'sug-bbbbbb',
      randomToken: () => 'test-token-' + 'b'.repeat(21),
    },
    auth: {
      redis,
      mailer,
      ownerEmail: 'jess@example.com',
      baseUrl: () => 'https://games.example',
      randomToken: () => 'test-token-' + 'a'.repeat(21),
    },
    chat: {
      limiter: null,
      dailyLimiter: null,
      assembleRulesText: () => 'the rules',
      streamRulesAnswer: async () => (async function* () {})(),
      apiKey: 'test-key',
      retryDelayMs: 0,
    },
    limiters: { votes: null, signInLink: null, suggest: null },
  };
  const deps: ApiDeps = { ...base, ...over(base) };
  const yoga = createApi(() => deps);
  // No Node request (`req`): the API reads the Fetch request's own headers.
  const serverContext = {
    req: undefined,
    waitUntil: (work: Promise<void> | void) => {
      if (work) deferred.push(work);
    },
  };
  const fetch = async (input: string, init?: RequestInit) =>
    yoga.fetch(new URL(input, 'https://games.example'), init ?? {}, serverContext);
  return {
    deps,
    redis,
    rawRedis,
    sent,
    deferred,
    fetch,
    async run(query, variables, init = {}) {
      const headers: Record<string, string> = { 'content-type': init.contentType ?? 'application/json' };
      if (init.cookie) headers.cookie = init.cookie;
      if (init.ip) headers['x-real-ip'] = init.ip;
      if (init.accept) headers.accept = init.accept;
      const res = await fetch('/api/graphql', { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
      const text = await res.text();
      const body = parseAnswer(text);
      return { status: res.status, data: body.data ?? null, errors: body.errors ?? [], headers: res.headers };
    },
  };
}

/** A JSON answer, or the last `next` event of a server-sent stream. */
function parseAnswer(text: string): { data?: Record<string, unknown> | null; errors?: GqlError[] } {
  const events = text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length));
  return JSON.parse(events.length ? events[events.length - 1] : text) as {
    data?: Record<string, unknown> | null;
    errors?: GqlError[];
  };
}

/** The `data:` payloads of a server-sent stream's `next` events, in order. */
export function sseEvents(text: string): unknown[] {
  return text
    .split('\n\n')
    .filter((block) => block.startsWith('event: next'))
    .map((block) => JSON.parse(block.split('\n')[1].slice('data: '.length)) as unknown);
}
