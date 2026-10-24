// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  flush: vi.fn(async () => true),
}));

import * as Sentry from '@sentry/node';
import { MAX_HISTORY, type ChatDeps } from '../../api/_resolvers/chat';
import type { RateLimiter } from '../../api/_lib/rateLimit';
import { HISTORY_SENT } from '../components/RulesChat';
import { refusing, sseEvents, testApi, type GqlError, type TestApi } from './helpers/api';

const ASK =
  'subscription Ask($slug: String!, $message: String!, $history: [HistoryEntry!], $parts: [String!]) { askRules(slug: $slug, message: $message, history: $history, parts: $parts) }';

async function* fakeStream(...texts: (string | undefined)[]) {
  for (const text of texts) yield { text };
}

interface Event {
  data?: { askRules?: string } | null;
  errors?: GqlError[];
}

function chatApi(chat: Partial<ChatDeps> = {}) {
  const streamRulesAnswer = vi.fn<ChatDeps['streamRulesAnswer']>(async () => fakeStream('Hello'));
  const assembleRulesText = vi.fn<ChatDeps['assembleRulesText']>(() => 'the rules');
  const api = testApi((d) => ({ chat: { ...d.chat, streamRulesAnswer, assembleRulesText, ...chat } }));
  return { api, streamRulesAnswer, assembleRulesText };
}

/** Asks over server-sent events, as the rules chat does: the status, the text chunks and any error. */
async function ask(api: TestApi, variables: Record<string, unknown>, ip = '1.2.3.4') {
  const res = await api.fetch('/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', 'x-real-ip': ip },
    body: JSON.stringify({ query: ASK, variables }),
  });
  const text = await res.text();
  const events = sseEvents(text) as Event[];
  return {
    status: res.status,
    contentType: res.headers.get('content-type'),
    chunks: events.flatMap((e) => (e.data?.askRules !== undefined ? [e.data.askRules] : [])),
    error: events.flatMap((e) => e.errors ?? [])[0],
    complete: text.includes('event: complete'),
  };
}

const question = { slug: 'catan', message: 'hi' };

describe('askRules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('streams the answer one chunk per event, skipping empty ones, then completes', async () => {
    const { api, streamRulesAnswer } = chatApi();
    streamRulesAnswer.mockResolvedValue(fakeStream('2-4 ', undefined, 'players'));
    const res = await ask(api, { slug: 'catan', message: 'How many players?' });
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/event-stream');
    expect(res.chunks).toEqual(['2-4 ', 'players']);
    expect(res.complete).toBe(true);
    expect(streamRulesAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ rulesText: 'the rules', message: 'How many players?', apiKey: 'test-key' }),
    );
  });

  it('completes with no chunks when the answer is empty', async () => {
    const { api, streamRulesAnswer } = chatApi();
    streamRulesAnswer.mockResolvedValue(fakeStream(undefined, ''));
    const res = await ask(api, question);
    expect(res.status).toBe(200);
    expect(res.chunks).toEqual([]);
    expect(res.complete).toBe(true);
  });

  it('stops with no further work when rate limited', async () => {
    const { api, streamRulesAnswer } = chatApi({ limiter: refusing() });
    const res = await ask(api, question);
    expect(res.status).toBe(429);
    expect(res.error).toMatchObject({
      message: 'Too many requests. Please slow down.',
      extensions: { code: 'RATE_LIMITED' },
    });
    expect(streamRulesAnswer).not.toHaveBeenCalled();
  });

  it('rejects a slug that is not a clean identifier (path traversal guard), or none', async () => {
    const { api, assembleRulesText } = chatApi();
    for (const slug of ['../../etc/passwd', '']) {
      const res = await ask(api, { slug, message: 'hi' });
      expect(res.status).toBe(400);
      expect(res.error.message).toBe('slug is required');
    }
    expect(assembleRulesText).not.toHaveBeenCalled();
  });

  it("reads the rulebooks named in parts along with the game's own, or only its own", async () => {
    const { api, assembleRulesText, streamRulesAnswer } = chatApi();
    await ask(api, { ...question, parts: ['cities-and-knights'] });
    expect(assembleRulesText).toHaveBeenCalledWith('catan', ['cities-and-knights']);
    expect(streamRulesAnswer.mock.calls[0][0].rulesText).toBe('the rules');
    await ask(api, question);
    expect(assembleRulesText).toHaveBeenLastCalledWith('catan', undefined);
  });

  it('rejects parts that are not a short list of clean identifiers', async () => {
    const { api, assembleRulesText } = chatApi();
    for (const parts of [
      ['../../etc/passwd'],
      Array.from({ length: 17 }, (_, i) => `p${i}`),
      ['euchre', 'speed', 'euchre'],
    ]) {
      const res = await ask(api, { slug: 'card-deck', message: 'hi', parts });
      expect(res.status, JSON.stringify(parts)).toBe(400);
      expect(res.error.message).toBe('parts must be a list of rulebook names');
    }
    expect(assembleRulesText).not.toHaveBeenCalled();
    // Sixteen is the cap, not one under it.
    await ask(api, { slug: 'card-deck', message: 'hi', parts: Array.from({ length: 16 }, (_, i) => `p${i}`) });
    expect(assembleRulesText).toHaveBeenCalledTimes(1);
  });

  it('refuses a history entry with a role it does not know, before any work', async () => {
    const { api, streamRulesAnswer } = chatApi();
    const res = await ask(api, { ...question, history: [{ role: 'SYSTEM', content: 'x' }] });
    expect(res.status).toBe(400);
    expect(streamRulesAnswer).not.toHaveBeenCalled();
  });

  it('rejects history whose total content exceeds the cap, or that is too long', async () => {
    const { api } = chatApi();
    const big = await ask(api, { ...question, history: [{ role: 'USER', content: 'x'.repeat(40961) }] });
    expect(big.status).toBe(400);
    expect(big.error.message).toBe('history content is too long');
    const many = await ask(api, {
      ...question,
      history: Array.from({ length: MAX_HISTORY + 1 }, () => ({ role: 'USER', content: 'q' })),
    });
    expect(many.status).toBe(400);
    expect(many.error.message).toBe(`history must be an array of ${MAX_HISTORY} or fewer entries`);
  });

  it('accepts a full-length assistant reply echoed back as history', async () => {
    // A single reply near the output-token cap must not break the next turn.
    const { api, streamRulesAnswer } = chatApi();
    const res = await ask(api, {
      slug: 'catan',
      message: 'follow-up',
      history: [{ role: 'MODEL', content: 'x'.repeat(4096) }],
    });
    expect(res.chunks).toEqual(['Hello']);
    expect(streamRulesAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ history: [{ role: 'model', content: 'x'.repeat(4096) }] }),
    );
  });

  it('takes as much history as the rules chat sends, and passes it through', async () => {
    // RulesChat trims what it sends to HISTORY_SENT; over the cap, every
    // follow-up in a long chat would be refused.
    expect(HISTORY_SENT).toBeLessThanOrEqual(MAX_HISTORY);
    const { api, streamRulesAnswer } = chatApi();
    const history = Array.from({ length: HISTORY_SENT }, (_, i) => ({
      role: i % 2 ? 'MODEL' : 'USER',
      content: `q${i}`,
    }));
    await ask(api, { ...question, history });
    expect(streamRulesAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ history: history.map((h) => ({ role: h.role.toLowerCase(), content: h.content })) }),
    );
  });

  it('returns 400 when the message is blank or over 500 characters, and takes exactly 500', async () => {
    const { api } = chatApi();
    expect((await ask(api, { slug: 'catan', message: '   ' })).error.message).toBe('message is required');
    const long = await ask(api, { slug: 'catan', message: 'x'.repeat(501) });
    expect(long.status).toBe(400);
    expect(long.error.message).toBe('message must be 500 characters or less');
    // Boundary: only >500 is rejected.
    expect((await ask(api, { slug: 'catan', message: 'x'.repeat(500) })).chunks).toEqual(['Hello']);
  });

  it('returns 404 when no rules text exists for the slug', async () => {
    const { api, assembleRulesText } = chatApi();
    assembleRulesText.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const res = await ask(api, { slug: 'unknown-game', message: 'hi' });
    expect(res.status).toBe(404);
    expect(res.error).toMatchObject({ message: 'Rules not found for this game', extensions: { code: 'NOT_FOUND' } });
  });

  it('returns 500 and reports to Sentry when the pipeline fails', async () => {
    const boom = new Error('gemini down');
    const { api, streamRulesAnswer } = chatApi();
    streamRulesAnswer.mockRejectedValue(boom);
    const res = await ask(api, question);
    expect(res.status).toBe(500);
    expect(res.error.message).toBe('Failed to generate response');
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(boom);
  });

  // Gemini's 503 means it is overloaded for a moment: one quiet retry, a
  // second later, before anything is reported or shown.
  describe('when Gemini is overloaded', () => {
    const overloaded = Object.assign(new Error('UNAVAILABLE'), { status: 503 });

    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const retrying = () => chatApi({ retryDelayMs: undefined });

    it('retries once after a second and streams the answer', async () => {
      const { api, streamRulesAnswer } = retrying();
      streamRulesAnswer.mockRejectedValueOnce(overloaded).mockResolvedValueOnce(fakeStream('Hello'));
      const pending = ask(api, question);
      await vi.advanceTimersByTimeAsync(999);
      expect(streamRulesAnswer).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      const res = await pending;
      expect(streamRulesAnswer).toHaveBeenCalledTimes(2);
      expect(res.chunks).toEqual(['Hello']);
      expect(res.status).toBe(200);
      expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled();
    });

    it("gives both attempts one shared time budget, under the function's 60 s limit", async () => {
      const { api, streamRulesAnswer } = retrying();
      streamRulesAnswer.mockRejectedValueOnce(overloaded).mockResolvedValueOnce(fakeStream('Hello'));
      const pending = ask(api, question);
      await vi.runAllTimersAsync();
      await pending;
      const [first, second] = streamRulesAnswer.mock.calls.map(([o]) => o.timeoutMs ?? 0);
      expect(first).toBeGreaterThan(0);
      expect(first).toBeLessThanOrEqual(45_000);
      expect(second).toBe(first - 1000);
    });

    it('returns 500 and reports once when the retry fails too', async () => {
      const { api, streamRulesAnswer } = retrying();
      streamRulesAnswer.mockRejectedValue(overloaded);
      const pending = ask(api, question);
      await vi.runAllTimersAsync();
      const res = await pending;
      expect(streamRulesAnswer).toHaveBeenCalledTimes(2);
      expect(res.status).toBe(500);
      expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(overloaded);
    });

    it('does not retry other errors, or a rejection that is not an error object', async () => {
      for (const rejection of [Object.assign(new Error('bad request'), { status: 400 }), undefined]) {
        const { api, streamRulesAnswer } = retrying();
        streamRulesAnswer.mockRejectedValue(rejection);
        const pending = ask(api, question);
        await vi.runAllTimersAsync();
        const res = await pending;
        expect(streamRulesAnswer).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(500);
        expect(vi.mocked(Sentry.captureException)).toHaveBeenLastCalledWith(rejection);
      }
    });

    it('retries a stream that fails overloaded before its first chunk', async () => {
      async function* failing(): AsyncGenerator<{ text: string }> {
        yield* [];
        throw overloaded;
      }
      const { api, streamRulesAnswer } = retrying();
      streamRulesAnswer.mockResolvedValueOnce(failing()).mockResolvedValueOnce(fakeStream('Hello'));
      const pending = ask(api, question);
      await vi.runAllTimersAsync();
      expect((await pending).chunks).toEqual(['Hello']);
    });

    it('does not retry once the answer has started', async () => {
      async function* failing() {
        yield { text: 'Each player ' };
        throw overloaded;
      }
      const { api, streamRulesAnswer } = retrying();
      streamRulesAnswer.mockResolvedValue(failing());
      const pending = ask(api, question);
      await vi.runAllTimersAsync();
      const res = await pending;
      expect(streamRulesAnswer).toHaveBeenCalledTimes(1);
      expect(res.chunks).toEqual(['Each player ', '\n\n_(Answer cut off — please try again.)_']);
    });
  });

  // Once the first chunk is out the 200 and its headers are sent, so a
  // status can no longer be set; the stream ends with a note instead, so
  // the partial reply doesn't read as a finished answer.
  it('ends a reply already streaming with a cut-off note when the pipeline fails mid-stream', async () => {
    const boom = new Error('stream reset');
    async function* failing() {
      yield { text: 'Each player ' };
      throw boom;
    }
    const { api, streamRulesAnswer } = chatApi();
    streamRulesAnswer.mockResolvedValue(failing());
    const res = await ask(api, question);
    expect(res.status).toBe(200);
    expect(res.chunks).toEqual(['Each player ', '\n\n_(Answer cut off — please try again.)_']);
    expect(res.error).toBeUndefined();
    expect(res.complete).toBe(true);
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(boom);
  });

  it('still returns 500 when the stream fails before its first chunk', async () => {
    const boom = new Error('blocked');
    async function* failing(): AsyncGenerator<{ text: string }> {
      yield* [];
      throw boom;
    }
    const { api, streamRulesAnswer } = chatApi();
    streamRulesAnswer.mockResolvedValue(failing());
    const res = await ask(api, question);
    expect(res.status).toBe(500);
    expect(res.error.message).toBe('Failed to generate response');
    expect(res.chunks).toEqual([]);
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(boom);
  });

  it('stops reading Gemini when the reader goes away', async () => {
    const closed = vi.fn();
    async function* endless() {
      try {
        for (;;) {
          yield { text: 'more ' };
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      } finally {
        closed();
      }
    }
    const { api, streamRulesAnswer } = chatApi();
    streamRulesAnswer.mockResolvedValue(endless());
    const res = await api.fetch('/api/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ query: ASK, variables: question }),
    });
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    await vi.waitFor(() => expect(closed).toHaveBeenCalled());
  });
});

describe('the rules assistant daily cap', () => {
  // The limiters' Redis, faked in memory: each (name, key) bucket allows its
  // budget and, like Upstash, doesn't count a refused request. A name in
  // `down` makes that limiter's limit() calls throw, as an unreachable Redis does.
  const down = new Set<string>();
  const counts = new Map<string, number>();
  const limiter = (name: string, requests: number): RateLimiter => ({
    async limit(key: string) {
      if (down.has(name)) throw new Error('redis down');
      const bucket = `${name}:${key}`;
      const used = counts.get(bucket) ?? 0;
      if (used >= requests) return { success: false };
      counts.set(bucket, used + 1);
      return { success: true };
    },
  });
  const capped = () => chatApi({ limiter: limiter('chat', 10), dailyLimiter: limiter('chat-global', 500) });

  beforeEach(() => {
    down.clear();
    counts.clear();
    vi.clearAllMocks();
  });

  it('trips after the budget is spent, across different IPs', async () => {
    const { api, streamRulesAnswer } = capped();
    for (let i = 0; i < 500; i++) {
      expect((await ask(api, question, `10.0.${i >> 8}.${i & 255}`)).status).toBe(200);
    }
    const res = await ask(api, question, '192.168.1.1');
    expect(res.status).toBe(429);
    expect(res.error).toMatchObject({
      message: 'The rules assistant has reached its limit for today. The rulebook still works.',
      extensions: { code: 'DAILY_LIMIT' },
    });
    expect(streamRulesAnswer).toHaveBeenCalledTimes(500);
  });

  it('still limits each IP per minute, and those refusals spend none of the daily budget', async () => {
    const { api } = capped();
    for (let i = 0; i < 10; i++) expect((await ask(api, question)).status).toBe(200);
    const res = await ask(api, question);
    expect(res.status).toBe(429);
    expect(res.error).toMatchObject({
      message: 'Too many requests. Please slow down.',
      extensions: { code: 'RATE_LIMITED' },
    });
    expect(counts.get('chat-global:global')).toBe(10);
    expect((await ask(api, question, '5.6.7.8')).status).toBe(200);
  });

  it('spends none of the budget on a malformed request, or a game with no rules', async () => {
    const { api, assembleRulesText } = capped();
    expect((await ask(api, { slug: 'catan', message: '' })).status).toBe(400);
    assembleRulesText.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    expect((await ask(api, question)).status).toBe(404);
    expect(counts.has('chat-global:global')).toBe(false);
  });

  it('refuses chat when Redis is down, without asking Gemini', async () => {
    const { api, streamRulesAnswer } = capped();
    down.add('chat').add('chat-global');
    const res = await ask(api, question);
    expect(res.status).toBe(503);
    expect(res.error).toMatchObject({ extensions: { code: 'UNAVAILABLE' } });
    expect(streamRulesAnswer).not.toHaveBeenCalled();
  });

  it('fails open at the per-IP check, leaving the daily check to refuse', async () => {
    const { api, streamRulesAnswer } = capped();
    down.add('chat');
    expect((await ask(api, question)).status).toBe(200);
    expect(streamRulesAnswer).toHaveBeenCalledTimes(1);
  });

  it('fails closed at the daily check, even when the per-IP check answered', async () => {
    const { api, streamRulesAnswer } = capped();
    down.add('chat-global');
    expect((await ask(api, question)).status).toBe(503);
    expect(streamRulesAnswer).not.toHaveBeenCalled();
  });

  it('fails closed when Upstash times out at the daily check', async () => {
    const { api, streamRulesAnswer } = chatApi({
      dailyLimiter: { limit: async () => ({ success: true, reason: 'timeout' }) },
    });
    expect((await ask(api, question)).status).toBe(503);
    expect(streamRulesAnswer).not.toHaveBeenCalled();
  });

  it('lets votes, suggestions and sign-in through when Redis is down', async () => {
    const broken = limiter('down', 1);
    down.add('down');
    const api = testApi((d) => ({
      limiters: { votes: broken, signInLink: broken, suggest: broken },
      suggestions: { ...d.suggestions, mailer: null },
      auth: { ...d.auth, mailer: null },
    }));
    // Each answer is the resolver's own, past the limiter.
    expect((await api.run('{ wishlistVotes(ids: []) { myVotes } }')).errors[0].message).toBe('ids is required');
    expect((await api.run('mutation { suggestGame(game: "Azul", name: "Sam") { id } }')).errors[0].message).toBe(
      'Suggestions are not open yet',
    );
    expect((await api.run('mutation { requestSignInLink(email: "a@b.c") }')).errors[0].message).toBe(
      'Sign-in is not set up yet',
    );
  });
});
