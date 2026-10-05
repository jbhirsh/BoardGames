import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
}));

vi.mock('../../api/_lib/rulesAssistant.js', () => ({
  loadRulesText: vi.fn(),
  otherRulebooks: vi.fn(() => []),
  otherRulebooksNote: vi.fn(() => ''),
  streamRulesAnswer: vi.fn(),
  RULES_ASSISTANT_MAX_OUTPUT_TOKENS: 1024,
}));

vi.mock('../../api/_lib/rateLimit.js', () => ({
  getLimiter: vi.fn(() => null),
  enforceRateLimit: vi.fn(async () => true),
}));

import * as Sentry from '@sentry/node';
import handler from '../../api/chat';
import { loadRulesText, otherRulebooks, otherRulebooksNote, streamRulesAnswer } from '../../api/_lib/rulesAssistant.js';
import { enforceRateLimit } from '../../api/_lib/rateLimit.js';

type Stream = Awaited<ReturnType<typeof streamRulesAnswer>>;

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    chunks: [] as string[],
    ended: false,
    status(code: number) { res.statusCode = code; return res; },
    json(data: unknown) { res.body = data; return res; },
    setHeader(name: string, value: string) { res.headers[name] = value; },
    write(chunk: string) { res.chunks.push(chunk); },
    end(chunk?: string) {
      if (chunk !== undefined) res.chunks.push(chunk);
      res.ended = true;
    },
  };
  return res;
}

function run(body: unknown, method = 'POST') {
  const res = makeRes();
  const req = { method, body } as unknown as VercelRequest;
  return handler(req, res as unknown as VercelResponse).then(() => res);
}

async function* fakeStream(...texts: (string | undefined)[]) {
  for (const text of texts) yield { text };
}

describe('chat handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadRulesText).mockReturnValue('the rules');
    vi.mocked(streamRulesAnswer).mockResolvedValue(
      fakeStream('Hello') as unknown as Stream,
    );
    vi.mocked(enforceRateLimit).mockResolvedValue(true);
  });

  it('returns 405 for non-POST methods', async () => {
    const res = await run({}, 'GET');
    expect(res.statusCode).toBe(405);
  });

  it('stops with no further work when rate limited', async () => {
    vi.mocked(enforceRateLimit).mockImplementation(async (_l, _req, res) => {
      (res as unknown as { status(c: number): { json(b: unknown): void } }).status(429).json({ error: 'Too many requests. Please slow down.' });
      return false;
    });
    const res = await run({ slug: 'catan', message: 'hi' });
    expect(res.statusCode).toBe(429);
    expect(vi.mocked(streamRulesAnswer)).not.toHaveBeenCalled();
  });

  it('rejects a slug that is not a clean identifier (path traversal guard)', async () => {
    const res = await run({ slug: '../../etc/passwd', message: 'hi' });
    expect(res.statusCode).toBe(400);
    expect(vi.mocked(loadRulesText)).not.toHaveBeenCalled();
  });

  it('reads the rulebooks named in parts along with the game\'s own', async () => {
    await run({ slug: 'catan', message: 'hi', parts: ['cities-and-knights'] });
    expect(vi.mocked(loadRulesText)).toHaveBeenCalledWith('catan', ['cities-and-knights']);
    expect(vi.mocked(streamRulesAnswer)).toHaveBeenCalled();
  });

  it('names the game\'s other rulebooks after the ones it reads', async () => {
    vi.mocked(otherRulebooks).mockReturnValueOnce(['5-6-player-extension']);
    vi.mocked(otherRulebooksNote).mockReturnValueOnce(' + the extension exists');
    await run({ slug: 'catan', message: 'hi', parts: ['cities-and-knights'] });
    expect(vi.mocked(otherRulebooks)).toHaveBeenCalledWith('catan', ['cities-and-knights']);
    expect(vi.mocked(otherRulebooksNote)).toHaveBeenCalledWith(['5-6-player-extension']);
    expect(vi.mocked(streamRulesAnswer).mock.calls[0][0].rulesText).toBe('the rules + the extension exists');
  });

  it('reads only the game\'s own rules when no parts are named', async () => {
    await run({ slug: 'catan', message: 'hi' });
    expect(vi.mocked(loadRulesText)).toHaveBeenCalledWith('catan', undefined);
  });

  it('rejects parts that are not a short list of clean identifiers', async () => {
    for (const parts of ['euchre', [42], ['../../etc/passwd'], Array.from({ length: 17 }, (_, i) => `p${i}`), ['euchre', 'speed', 'euchre']]) {
      const res = await run({ slug: 'card-deck', message: 'hi', parts });
      expect(res.statusCode, JSON.stringify(parts)).toBe(400);
    }
    expect(vi.mocked(loadRulesText)).not.toHaveBeenCalled();
    // Sixteen is the cap, not one under it.
    await run({ slug: 'card-deck', message: 'hi', parts: Array.from({ length: 16 }, (_, i) => `p${i}`) });
    expect(vi.mocked(loadRulesText)).toHaveBeenCalledTimes(1);
  });

  it('rejects a history entry with a bad role or non-string content', async () => {
    expect((await run({ slug: 'catan', message: 'hi', history: [{ role: 'system', content: 'x' }] })).statusCode).toBe(400);
    expect((await run({ slug: 'catan', message: 'hi', history: [{ role: 'user', content: 123 }] })).statusCode).toBe(400);
  });

  it('rejects history whose total content exceeds the cap', async () => {
    const history = [{ role: 'user', content: 'x'.repeat(40961) }];
    const res = await run({ slug: 'catan', message: 'hi', history });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'history content is too long' });
  });

  it('accepts a full-length assistant reply echoed back as history', async () => {
    // A single reply near the output-token cap must not break the next turn:
    // it should reach the pipeline, not be rejected as "history too long".
    const history = [{ role: 'model', content: 'x'.repeat(4096) }];
    const res = await run({ slug: 'catan', message: 'follow-up', history });
    expect(res.statusCode).not.toBe(400);
    expect(res.ended).toBe(true);
    expect(vi.mocked(streamRulesAnswer)).toHaveBeenCalled();
  });

  it('returns 400 when slug is missing', async () => {
    const res = await run({ message: 'hi' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'slug is required' });
  });

  it.each([undefined, null, 'not json'])('returns 400 when the body is %s', async (body) => {
    const res = await run(body);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'slug is required' });
    expect(vi.mocked(streamRulesAnswer)).not.toHaveBeenCalled();
  });

  it('returns 400 when message is missing or blank', async () => {
    expect((await run({ slug: 'catan' })).statusCode).toBe(400);
    expect((await run({ slug: 'catan', message: '   ' })).statusCode).toBe(400);
  });

  it('returns 400 when message exceeds 500 characters', async () => {
    const res = await run({ slug: 'catan', message: 'x'.repeat(501) });
    expect(res.statusCode).toBe(400);
  });

  it('accepts a message of exactly 500 characters', async () => {
    // Boundary: only >500 is rejected. Pins `message.length > 500` so it can't
    // be weakened to `>= 500`, which would reject a legitimate max-length message.
    const res = await run({ slug: 'catan', message: 'x'.repeat(500) });
    expect(res.statusCode).not.toBe(400);
    expect(res.ended).toBe(true);
  });

  it('returns 400 when history is not an array or too long', async () => {
    expect((await run({ slug: 'catan', message: 'hi', history: 'nope' })).statusCode).toBe(400);
    const history = Array.from({ length: 11 }, () => ({ role: 'user', content: 'q' }));
    expect((await run({ slug: 'catan', message: 'hi', history })).statusCode).toBe(400);
  });

  it('returns 404 when no rules text exists for the slug', async () => {
    vi.mocked(loadRulesText).mockImplementation(() => { throw new Error('ENOENT'); });
    const res = await run({ slug: 'unknown-game', message: 'hi' });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Rules not found for this game' });
  });

  it('streams the answer as plain text and ends the response', async () => {
    vi.mocked(streamRulesAnswer).mockResolvedValue(
      fakeStream('2-4 ', undefined, 'players') as unknown as Stream,
    );
    const res = await run({ slug: 'catan', message: 'How many players?' });
    expect(res.headers['Content-Type']).toBe('text/plain; charset=utf-8');
    expect(res.chunks.join('')).toBe('2-4 players');
    expect(res.ended).toBe(true);
    expect(vi.mocked(streamRulesAnswer)).toHaveBeenCalledWith(
      expect.objectContaining({ rulesText: 'the rules', message: 'How many players?' }),
    );
  });

  it('passes history through to the pipeline', async () => {
    const history = [{ role: 'user', content: 'earlier question' }];
    await run({ slug: 'catan', message: 'hi', history });
    expect(vi.mocked(streamRulesAnswer)).toHaveBeenCalledWith(
      expect.objectContaining({ history }),
    );
  });

  it('returns 500 and reports to Sentry when the pipeline fails', async () => {
    const boom = new Error('gemini down');
    vi.mocked(streamRulesAnswer).mockRejectedValue(boom);
    const res = await run({ slug: 'catan', message: 'hi' });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to generate response' });
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(boom);
  });

  // Once the first chunk is written the 200 and its headers are sent, so a
  // status can no longer be set; the stream ends with a note instead, so the
  // partial reply doesn't read as a finished answer.
  it('ends a reply already streaming with a cut-off note when the pipeline fails mid-stream', async () => {
    const boom = new Error('stream reset');
    async function* failing() {
      yield { text: 'Each player ' };
      throw boom;
    }
    vi.mocked(streamRulesAnswer).mockResolvedValue(failing() as unknown as Stream);
    const res = await run({ slug: 'catan', message: 'hi' });
    expect(res.chunks).toEqual(['Each player ', '\n\n_(Answer cut off — please try again.)_']);
    expect(res.ended).toBe(true);
    expect(res.statusCode).toBe(0);
    expect(res.body).toBeUndefined();
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(boom);
  });

  it('still returns 500 when the stream fails before its first chunk', async () => {
    const boom = new Error('blocked');
    async function* failing(): AsyncGenerator<{ text: string }> {
      yield* [];
      throw boom;
    }
    vi.mocked(streamRulesAnswer).mockResolvedValue(failing() as unknown as Stream);
    const res = await run({ slug: 'catan', message: 'hi' });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to generate response' });
    expect(res.chunks).toEqual([]);
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(boom);
  });
});
