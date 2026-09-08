import { describe, it, expect, vi } from 'vitest';
import {
  handleSuggestions,
  type SuggestionsDeps,
  type SuggestionsRedis,
  type SuggestionsResponse,
  type Mail,
} from '../../api/suggestions';

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { res.statusCode = code; return res as unknown as SuggestionsResponse; },
    json(data: unknown) { res.body = data; return res as unknown as SuggestionsResponse; },
    setHeader(name: string, value: string) { res.headers[name] = value; return res as unknown as SuggestionsResponse; },
    send(body: string) { res.body = body; return res as unknown as SuggestionsResponse; },
  };
  return res;
}

type Store = Record<string, Record<string, unknown>>;
type Lists = Record<string, string[]>;

/** In-memory hashes and lists; values round-trip through JSON like the Upstash client. */
function makeRedis(seed: Store = {}, lists: Lists = {}): SuggestionsRedis & { store: Store; lists: Lists } {
  const store: Store = JSON.parse(JSON.stringify(seed));
  const l: Lists = JSON.parse(JSON.stringify(lists));
  const get = (k: string) => (store[k] && Object.keys(store[k]).length ? store[k] : null);
  return {
    store,
    lists: l,
    hset: vi.fn(async (key, fields) => { store[key] = { ...(store[key] ?? {}), ...fields }; return Object.keys(fields).length; }),
    hgetall: vi.fn(async (key) => get(key)),
    lpush: vi.fn(async (key, value) => { (l[key] ??= []).unshift(value); return l[key].length; }),
    lrem: vi.fn(async (key, _count, value) => { const before = (l[key] ?? []).length; l[key] = (l[key] ?? []).filter((v) => v !== value); return before - l[key].length; }),
    lrange: vi.fn(async (key) => [...(l[key] ?? [])]),
    pipeline: () => {
      const keys: string[] = [];
      const api = {
        hgetall: vi.fn((key: string) => { keys.push(key); return api; }),
        exec: vi.fn(async () => keys.map(get)),
      };
      return api;
    },
  };
}

// Deliberately low-entropy so secret scanners don't mistake them for keys.
const TOKEN = 'test-token-' + 'a'.repeat(21);
const NEW_TOKEN = 'test-token-' + 'b'.repeat(21);
const pending = { id: 'sug-aaaaaa', game: 'Wingspan', name: 'Alex', note: 'Great engine builder', status: 'pending', createdAt: 1000, token: TOKEN };

function deps(over: Partial<SuggestionsDeps> = {}): SuggestionsDeps & { sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    redis: makeRedis(),
    mailer: { send: vi.fn(async (m: Mail) => { sent.push(m); }) },
    baseUrl: () => 'https://games.example/',
    now: () => 5000,
    randomId: () => 'sug-bbbbbb',
    randomToken: () => NEW_TOKEN,
    sent,
    ...over,
  };
}

const valid = { game: 'Cascadia', name: 'Sam', note: 'Calm and quick' };
const BELL = String.fromCharCode(7);

describe('handleSuggestions', () => {
  it('returns 405 for unsupported methods', async () => {
    const res = makeRes();
    await handleSuggestions(deps(), { method: 'PUT', query: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  describe('GET list', () => {
    it('reads only the approved list, newest decision first, without tokens', async () => {
      const redis = makeRedis({
        'suggestions:sug-a': { ...pending, id: 'sug-a', status: 'approved', decidedAt: 10 },
        'suggestions:sug-b': { ...pending, id: 'sug-b', game: 'Azul', status: 'approved', decidedAt: 20 },
        'suggestions:sug-d': { ...pending, id: 'sug-d', game: 'Later' },
      }, { 'suggestions:approved': ['sug-a', 'sug-b'], 'suggestions:active': ['sug-d', 'sug-b', 'sug-a'] });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: {} }, res);
      expect(res.statusCode).toBe(200);
      const items = (res.body as { items: Array<Record<string, unknown>> }).items;
      expect(items.map((i) => i.game)).toEqual(['Azul', 'Wingspan']);
      expect(items[0]).not.toHaveProperty('token');
      expect(redis.lrange).toHaveBeenCalledWith('suggestions:approved', 0, -1);
    });

    it('coerces values the Redis client deserialised, so a game called 1830 survives', async () => {
      const redis = makeRedis({
        'suggestions:sug-n': { ...pending, id: 'sug-n', game: 1830, name: 42, note: true, status: 'approved', decidedAt: 1 },
      }, { 'suggestions:approved': ['sug-n'] });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: {} }, res);
      expect((res.body as { items: Array<{ game: string; name: string; note: string }> }).items[0])
        .toMatchObject({ game: '1830', name: '42', note: 'true' });
    });

    it('returns an empty list when nothing has been approved', async () => {
      const res = makeRes();
      await handleSuggestions(deps(), { method: 'GET', query: {} }, res);
      expect(res.body).toEqual({ items: [] });
    });
  });

  describe('GET decision links', () => {
    it('rejects unknown actions and malformed ids or tokens', async () => {
      for (const query of [
        { action: 'explode', id: 'sug-a', token: TOKEN },
        { action: 'approve', id: 'Bad!', token: TOKEN },
        { action: 'approve', id: 'sug-a', token: 'short' },
      ]) {
        const res = makeRes();
        await handleSuggestions(deps(), { method: 'GET', query }, res);
        expect(res.statusCode, JSON.stringify(query)).toBe(400);
      }
    });

    it('404s for an unknown suggestion and 403s for a wrong token', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
      let res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: { action: 'approve', id: 'sug-zzzzzz', token: TOKEN } }, res);
      expect(res.statusCode).toBe(404);
      res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: { action: 'approve', id: 'sug-aaaaaa', token: 'test-token-' + 'z'.repeat(21) } }, res);
      expect(res.statusCode).toBe(403);
    });

    it('never mutates on GET: renders a confirmation form carrying the decision', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: { action: 'deny', id: 'sug-aaaaaa', token: TOKEN } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toContain('text/html');
      expect(redis.hset).not.toHaveBeenCalled();
      const html = String(res.body);
      expect(html).toContain('Deny Wingspan?');
      expect(html).toContain('method="post"');
      expect(html).toContain('name="decision" value="deny"');
      expect(html).toContain(`name="token" value="${TOKEN}"`);
      expect(html).toContain('name="robots" content="noindex"');
    });

    it('tells a stale link the suggestion was already decided', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': { ...pending, status: 'approved', decidedAt: 10 } });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: { action: 'deny', id: 'sug-aaaaaa', token: TOKEN } }, res);
      expect(String(res.body)).toContain('Already approved');
      expect(String(res.body)).not.toContain('method="post"');
    });

    it('escapes game and name in the page', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': { ...pending, game: '<b>x</b>', name: 'A&B' } });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: { action: 'approve', id: 'sug-aaaaaa', token: TOKEN } }, res);
      expect(String(res.body)).toContain('&lt;b&gt;x&lt;/b&gt;');
      expect(String(res.body)).toContain('A&amp;B');
      expect(String(res.body)).not.toContain('<b>x</b>');
    });
  });

  describe('POST decision', () => {
    it('approves: flips status, adds to the approved list, keeps it active', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } }, res);
      expect(res.statusCode).toBe(200);
      expect(redis.hset).toHaveBeenCalledWith('suggestions:sug-aaaaaa', { status: 'approved', decidedAt: 5000 });
      expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
      expect(redis.lists['suggestions:active']).toEqual(['sug-aaaaaa']);
      expect(String(res.body)).toContain('Approved');
      expect(String(res.body)).toContain('Alex');
    });

    it('denies: flips status and drops it from the active list', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa', 'sug-other'] });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'POST', query: {}, body: { decision: 'deny', id: 'sug-aaaaaa', token: TOKEN } }, res);
      expect(redis.hset).toHaveBeenCalledWith('suggestions:sug-aaaaaa', { status: 'denied', decidedAt: 5000 });
      expect(redis.lists['suggestions:active']).toEqual(['sug-other']);
      expect(redis.lists['suggestions:approved']).toBeUndefined();
      expect(String(res.body)).toContain('Denied');
    });

    it('does not change an already-decided suggestion', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': { ...pending, status: 'denied', decidedAt: 10 } });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } }, res);
      expect(redis.hset).not.toHaveBeenCalled();
      expect(String(res.body)).toContain('Already denied');
    });

    it('rejects an unknown decision and a bad token', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
      let res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'POST', query: {}, body: { decision: 'maybe', id: 'sug-aaaaaa', token: TOKEN } }, res);
      expect(res.statusCode).toBe(400);
      res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: 'test-token-' + 'z'.repeat(21) } }, res);
      expect(res.statusCode).toBe(403);
      expect(redis.hset).not.toHaveBeenCalled();
    });
  });

  describe('unsent records (send call failed after possible delivery)', () => {
    const unsent = { ...pending, status: 'unsent' };

    it('still offers the confirmation form from the emailed link', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': unsent });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: { action: 'approve', id: 'sug-aaaaaa', token: TOKEN } }, res);
      expect(String(res.body)).toContain('Approve Wingspan?');
      expect(String(res.body)).toContain('method="post"');
    });

    it('approving puts it back on the active list as well as the approved list', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': unsent }, { 'suggestions:active': [] });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } }, res);
      expect(String(res.body)).toContain('Approved');
      expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
      expect(redis.lists['suggestions:active']).toEqual(['sug-aaaaaa']);
    });

    it('denying leaves it out of both lists', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': unsent }, { 'suggestions:active': [] });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'POST', query: {}, body: { decision: 'deny', id: 'sug-aaaaaa', token: TOKEN } }, res);
      expect(String(res.body)).toContain('Denied');
      expect(redis.lists['suggestions:active']).toEqual([]);
      expect(redis.lists['suggestions:approved']).toBeUndefined();
    });
  });

  describe('POST new suggestion', () => {
    it('refuses with 503 when email is not configured', async () => {
      const res = makeRes();
      await handleSuggestions(deps({ mailer: null }), { method: 'POST', query: {}, body: valid }, res);
      expect(res.statusCode).toBe(503);
    });

    it('validates game, name and note', async () => {
      for (const body of [
        { ...valid, game: 'A' },
        { ...valid, game: 'x'.repeat(81) },
        { ...valid, game: `Bell${BELL}here` },
        { ...valid, name: '' },
        { ...valid, name: '<script>' },
        { ...valid, note: 'n'.repeat(201) },
      ]) {
        const res = makeRes();
        await handleSuggestions(deps(), { method: 'POST', query: {}, body }, res);
        expect(res.statusCode, JSON.stringify(body)).toBe(400);
      }
    });

    it('stores the suggestion before emailing, so the emailed links always resolve', async () => {
      const order: string[] = [];
      const redis = makeRedis();
      redis.hset = vi.fn(async (key, fields) => { order.push(`hset:${key}`); redis.store[key] = { ...(redis.store[key] ?? {}), ...fields }; return 1; });
      const mailer = { send: vi.fn(async () => { order.push('send'); }) };
      await handleSuggestions(deps({ redis, mailer }), { method: 'POST', query: {}, body: valid }, makeRes());
      expect(order).toEqual(['hset:suggestions:sug-bbbbbb', 'send']);
    });

    it('emails the owner links to the confirmation page and stores it as pending and active', async () => {
      const d = deps();
      const res = makeRes();
      await handleSuggestions(d, { method: 'POST', query: {}, body: { ...valid, game: '  Cascadia   ' } }, res);
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ item: { id: 'sug-bbbbbb', game: 'Cascadia', name: 'Sam', note: 'Calm and quick', status: 'pending', createdAt: 5000 } });

      expect(d.sent).toHaveLength(1);
      expect(d.sent[0].subject).toBe('Game suggestion: Cascadia (from Sam)');
      expect(d.sent[0].html).toContain(`https://games.example/api/suggestions?action=approve&id=sug-bbbbbb&token=${NEW_TOKEN}`);
      expect(d.sent[0].html).toContain('action=deny&id=sug-bbbbbb');
      expect(d.sent[0].html).toContain('Calm and quick');

      expect(d.redis.hset).toHaveBeenCalledWith('suggestions:sug-bbbbbb', expect.objectContaining({ game: 'Cascadia', name: 'Sam', status: 'pending', token: NEW_TOKEN }));
      expect(d.redis.lpush).toHaveBeenCalledWith('suggestions:active', 'sug-bbbbbb');
      expect(d.redis.lpush).not.toHaveBeenCalledWith('suggestions:approved', expect.anything());
    });

    it('escapes suggester text in the email', async () => {
      const d = deps();
      await handleSuggestions(d, { method: 'POST', query: {}, body: { ...valid, game: 'Tak <3', note: '<img src=x>' } }, makeRes());
      expect(d.sent[0].html).toContain('Tak &lt;3');
      expect(d.sent[0].html).toContain('&lt;img src=x&gt;');
    });

    it('rolls the record out of the active list when the email fails, so a retry is not a duplicate', async () => {
      const redis = makeRedis();
      const d = deps({ redis, mailer: { send: vi.fn(async () => { throw new Error('resend down'); }) } });
      let res = makeRes();
      await handleSuggestions(d, { method: 'POST', query: {}, body: valid }, res);
      expect(res.statusCode).toBe(500);
      expect(redis.lists['suggestions:active']).toEqual([]);
      expect(redis.store['suggestions:sug-bbbbbb'].status).toBe('unsent');

      const ok = deps({ redis, randomId: () => 'sug-cccccc' });
      res = makeRes();
      await handleSuggestions(ok, { method: 'POST', query: {}, body: valid }, res);
      expect(res.statusCode).toBe(201);
      expect(ok.sent).toHaveLength(1);
    });

    it('does not email when the store itself fails', async () => {
      const redis = makeRedis();
      redis.hset = vi.fn(async () => { throw new Error('redis down'); });
      const d = deps({ redis });
      const res = makeRes();
      await handleSuggestions(d, { method: 'POST', query: {}, body: valid }, res);
      expect(res.statusCode).toBe(500);
      expect(d.sent).toHaveLength(0);
    });

    it('never touches the base URL on reads, only when sending', async () => {
      const baseUrl = vi.fn(() => { throw new Error('APP_URL must be set'); });
      const res = makeRes();
      await handleSuggestions(deps({ baseUrl }), { method: 'GET', query: {} }, res);
      expect(res.statusCode).toBe(200);
      expect(baseUrl).not.toHaveBeenCalled();
    });

    it('rejects a game already pending or approved, but allows one that was denied', async () => {
      const redis = makeRedis({
        'suggestions:sug-p': { ...pending, id: 'sug-p', game: 'Cascadia!' },
        'suggestions:sug-a': { ...pending, id: 'sug-a', game: 'Azul', status: 'approved', decidedAt: 1 },
        'suggestions:sug-d': { ...pending, id: 'sug-d', game: 'Root', status: 'denied', decidedAt: 1 },
      }, { 'suggestions:active': ['sug-p', 'sug-a'], 'suggestions:approved': ['sug-a'] });
      let res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'POST', query: {}, body: { ...valid, game: 'cascadia' } }, res);
      expect(res.statusCode).toBe(409);
      expect((res.body as { error: string }).error).toContain('waiting for approval');
      res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'POST', query: {}, body: { ...valid, game: 'AZUL' } }, res);
      expect(res.statusCode).toBe(409);
      expect((res.body as { error: string }).error).toContain('already on the wishlist');
      res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'POST', query: {}, body: { ...valid, game: 'Root' } }, res);
      expect(res.statusCode).toBe(201);
    });
  });
});
