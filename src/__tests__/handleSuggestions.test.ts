import { describe, it, expect, vi } from 'vitest';
import {
  handleSuggestions,
  KEYWORD_IDS,
  WISHLIST_SECTION_IDS,
  type SuggestionsDeps,
  type SuggestionsRedis,
  type SuggestionsResponse,
  type Mail,
} from '../../api/suggestions';
import { KW, WISHLIST_SECTIONS } from '../data/keywords';

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
    baseUrl: () => 'https://games.example',
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

    it('approving looks the game up and stores its details; the public list returns them', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
      const lookup = vi.fn(async () => ({ bggId: 266192, name: 'Wingspan', year: 2019, min: 1, max: 5, mins: 70, desc: 'Birds.', kw: ['strategy'] }));
      await handleSuggestions(deps({ redis, lookup }), { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } }, makeRes());
      expect(lookup).toHaveBeenCalledWith('Wingspan');
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: {} }, res);
      const [item] = (res.body as { items: Array<{ details?: Record<string, unknown> }> }).items;
      expect(item.details).toEqual({ bggId: 266192, year: 2019, min: 1, max: 5, mins: 70, desc: 'Birds.', kw: ['strategy'] });
    });

    it('lists the game as approved before the lookup runs, so a hung lookup cannot strand it', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
      let listedWhenLookedUp: string[] | undefined;
      const lookup = vi.fn(async () => { listedWhenLookedUp = [...(redis.lists['suggestions:approved'] ?? [])]; return null; });
      await handleSuggestions(deps({ redis, lookup }), { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } }, makeRes());
      expect(listedWhenLookedUp).toEqual(['sug-aaaaaa']);
    });

    it('still approves when the lookup finds nothing or throws', async () => {
      for (const lookup of [vi.fn(async () => null), vi.fn(async () => { throw new Error('bgg down'); })]) {
        const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
        const res = makeRes();
        await handleSuggestions(deps({ redis, lookup }), { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } }, res);
        expect(res.statusCode).toBe(200);
        expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
        expect(redis.store['suggestions:sug-aaaaaa'].details).toBeUndefined();
      }
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
      expect(res.body).toEqual({ item: { id: 'sug-bbbbbb', game: 'Cascadia', name: 'Sam', note: 'Calm and quick', status: 'pending', createdAt: 5000, source: 'friend' } });

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
      // Tracked so the owner's on-site queue can still surface it.
      expect(redis.lists['suggestions:unsent']).toEqual(['sug-bbbbbb']);

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

  describe('POST new suggestion: input shaping', () => {
    const post = async (body: unknown, d = deps()) => {
      const res = makeRes();
      await handleSuggestions(d, { method: 'POST', query: {}, body }, res);
      return res;
    };

    it('rejects names with a leading or trailing invalid character, with the message', async () => {
      for (const name of ['!Bob', 'Bob!!']) {
        const res = await post({ ...valid, name });
        expect(res.statusCode, name).toBe(400);
        expect(res.body).toEqual({ error: 'name must be 1–30 letters, digits, spaces or basic punctuation' });
      }
    });

    it('rejects a non-string game or name with 400, not a crash', async () => {
      let res = await post({ ...valid, game: 42 });
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'game must be 2–80 characters' });
      res = await post({ ...valid, name: 42 });
      expect(res.statusCode).toBe(400);
    });

    it('treats a non-string note as empty', async () => {
      const d = deps();
      const res = await post({ ...valid, note: 7 }, d);
      expect(res.statusCode).toBe(201);
      expect(d.redis.hset).toHaveBeenCalledWith('suggestions:sug-bbbbbb', expect.objectContaining({ note: '' }));
    });

    it('trims game, name and note and collapses internal whitespace before storing', async () => {
      const d = deps();
      const res = await post({ game: '  Terra   Mystica \t Rules ', name: '  Sam  ', note: ' so   good\n\nreally ' }, d);
      expect(res.statusCode).toBe(201);
      expect(d.redis.hset).toHaveBeenCalledWith('suggestions:sug-bbbbbb', {
        id: 'sug-bbbbbb', game: 'Terra Mystica Rules', name: 'Sam', note: 'so good really', status: 'pending', createdAt: 5000, token: NEW_TOKEN,
      });
    });

    it('accepts games at exactly the min and max length and rejects one over', async () => {
      expect((await post({ ...valid, game: 'Go' })).statusCode).toBe(201);
      expect((await post({ ...valid, game: 'x'.repeat(80) })).statusCode).toBe(201);
      const res = await post({ ...valid, game: 'x'.repeat(81) });
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'game must be 2–80 characters' });
    });

    it('accepts a note at exactly the max length and rejects one over, with the message', async () => {
      expect((await post({ ...valid, note: 'n'.repeat(200) })).statusCode).toBe(201);
      const res = await post({ ...valid, note: 'n'.repeat(201) });
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'note must be at most 200 characters' });
    });

    it('reports the exact 503 and 405 bodies', async () => {
      let res = await post(valid, deps({ mailer: null }));
      expect(res.body).toEqual({ error: 'Suggestions are not open yet' });
      res = makeRes();
      await handleSuggestions(deps(), { method: 'PUT', query: {} }, res);
      expect(res.body).toEqual({ error: 'Method not allowed' });
    });
  });

  describe('POST new suggestion: duplicate check', () => {
    it('lets a denied game be suggested again even if its id lingers on the active list', async () => {
      const redis = makeRedis({
        'suggestions:sug-d': { ...pending, id: 'sug-d', game: 'Root', status: 'denied', decidedAt: 1 },
      }, { 'suggestions:active': ['sug-d'] });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'POST', query: {}, body: { ...valid, game: 'Root' } }, res);
      expect(res.statusCode).toBe(201);
    });

    it('ignores punctuation and whitespace differences when spotting a duplicate', async () => {
      const redis = makeRedis({
        'suggestions:sug-w': { ...pending, id: 'sug-w', game: '7 Wonders' },
      }, { 'suggestions:active': ['sug-w'] });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'POST', query: {}, body: { ...valid, game: '7 - Wonders!!' } }, res);
      expect(res.statusCode).toBe(409);
      expect(res.body).toEqual({ error: '7 Wonders has already been suggested and is waiting for approval' });
    });
  });

  describe('decision links: authorisation edge cases', () => {
    const decide = async (redis: SuggestionsRedis, body: Record<string, unknown>) => {
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN, ...body } }, res);
      return res;
    };

    it('403s, rather than crashing, on a well-formed token of a different length', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
      const res = await decide(redis, { token: 'test-token-' + 'a'.repeat(9) });
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: 'invalid token' });
      expect(redis.hset).not.toHaveBeenCalled();
    });

    it('400s on tokens with a stray character at either end, or over 64 chars', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
      for (const token of ['!' + 'a'.repeat(20), 'a'.repeat(20) + '!', 'a'.repeat(65)]) {
        const res = await decide(redis, { token });
        expect(res.statusCode, token).toBe(400);
        expect(res.body).toEqual({ error: 'invalid id or token' });
      }
    });

    it('400s on a non-string id or token instead of coercing them', async () => {
      const redis = makeRedis({ 'suggestions:7': { ...pending, id: '7' }, 'suggestions:sug-aaaaaa': pending });
      for (const body of [{ id: 7 }, { token: 1e19 }, { id: undefined }]) {
        const res = await decide(redis, body);
        expect(res.statusCode, JSON.stringify(body)).toBe(400);
        expect(res.body).toEqual({ error: 'invalid id or token' });
      }
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: { action: 'approve', token: TOKEN } }, res);
      expect(res.statusCode).toBe(400);
    });

    it('reports the exact bodies for an unknown id, action and decision', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
      let res = await decide(redis, { id: 'sug-zzzzzz' });
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'suggestion not found' });
      res = await decide(redis, { decision: 'maybe' });
      expect(res.body).toEqual({ error: 'unknown decision' });
      res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: { action: 'explode', id: 'sug-aaaaaa', token: TOKEN } }, res);
      expect(res.body).toEqual({ error: 'unknown action' });
    });

    it('serves the decision result as HTML and tells a denier the game is off the wishlist', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
      const res = await decide(redis, { decision: 'deny' });
      expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
      expect(String(res.body)).toContain("Wingspan won't appear on the wishlist.");
      expect(String(res.body)).not.toContain('is now on the wishlist');
    });

    it('treats an unrecognised stored status as pending and offers the form', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': { ...pending, status: 'weird' } });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: { action: 'approve', id: 'sug-aaaaaa', token: TOKEN } }, res);
      expect(String(res.body)).toContain('method="post"');
      expect(String(res.body)).not.toContain('Already');
    });
  });

  describe('GET list: parsing stored hashes', () => {
    const list = async (redis: SuggestionsRedis) => {
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: {} }, res);
      expect(res.statusCode).toBe(200);
      return (res.body as { items: Array<Record<string, unknown>> }).items;
    };
    const approved = { ...pending, status: 'approved', decidedAt: 10 };
    const without = (o: Record<string, unknown>, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));

    it('skips hashes missing an id, game or name, or with a null game, instead of crashing', async () => {
      const redis = makeRedis({
        'suggestions:sug-1': without(approved, 'id'),
        'suggestions:sug-2': without(approved, 'game'),
        'suggestions:sug-3': without(approved, 'name'),
        'suggestions:sug-4': { ...approved, id: 'sug-4', game: null },
        'suggestions:sug-5': { ...approved, id: 'sug-5', game: 'Kept' },
      }, { 'suggestions:approved': ['sug-1', 'sug-2', 'sug-3', 'sug-4', 'sug-5', 'sug-missing'] });
      expect((await list(redis)).map((i) => i.game)).toEqual(['Kept']);
    });

    it('excludes listed ids whose hash is not approved, including unknown statuses', async () => {
      const redis = makeRedis({
        'suggestions:sug-1': { ...approved, id: 'sug-1', status: 'denied' },
        'suggestions:sug-2': { ...approved, id: 'sug-2', status: 'weird' },
        'suggestions:sug-3': { ...approved, id: 'sug-3', status: 'pending' },
        'suggestions:sug-4': { ...approved, id: 'sug-4' },
      }, { 'suggestions:approved': ['sug-1', 'sug-2', 'sug-3', 'sug-4'] });
      expect((await list(redis)).map((i) => i.id)).toEqual(['sug-4']);
    });

    it('orders by decidedAt descending whatever the list order', async () => {
      const redis = makeRedis({
        'suggestions:sug-1': { ...approved, id: 'sug-1', decidedAt: 1 },
        'suggestions:sug-2': { ...approved, id: 'sug-2', decidedAt: 2 },
        'suggestions:sug-3': { ...approved, id: 'sug-3', decidedAt: 3 },
      }, { 'suggestions:approved': ['sug-1', 'sug-2', 'sug-3'] });
      expect((await list(redis)).map((i) => i.id)).toEqual(['sug-3', 'sug-2', 'sug-1']);
    });

    it('keeps numeric timestamps, falls back to 0 for a garbled createdAt and leaves decidedAt unset when absent', async () => {
      const redis = makeRedis({
        'suggestions:sug-1': { ...approved, id: 'sug-1', createdAt: 1234 },
        'suggestions:sug-2': { ...without(approved, 'decidedAt'), id: 'sug-2', createdAt: 'yesterday' },
      }, { 'suggestions:approved': ['sug-1', 'sug-2'] });
      const items = await list(redis);
      expect(items[0]).toMatchObject({ id: 'sug-1', createdAt: 1234, decidedAt: 10 });
      expect(items[1].createdAt).toBe(0);
      expect(items[1].decidedAt).toBeUndefined();
    });

    it('does not open a pipeline when the list is empty', async () => {
      const redis = makeRedis();
      redis.pipeline = vi.fn(redis.pipeline);
      expect(await list(redis)).toEqual([]);
      expect(redis.pipeline).not.toHaveBeenCalled();
    });

    describe('details', () => {
      const withDetails = async (details: unknown) => {
        const redis = makeRedis({ 'suggestions:sug-1': { ...approved, id: 'sug-1', details } }, { 'suggestions:approved': ['sug-1'] });
        return (await list(redis))[0].details;
      };
      const full = { bggId: 1, year: 2000, min: 2, max: 4, mins: 30, desc: 'Fun.', kw: ['party'] };

      it('accepts details as a JSON string or as an already-parsed object', async () => {
        expect(await withDetails(JSON.stringify(full))).toEqual(full);
        expect(await withDetails(full)).toEqual(full);
      });

      it('drops details that are not JSON, not an object, or absent', async () => {
        expect(await withDetails('not json')).toBeUndefined();
        expect(await withDetails(42)).toBeUndefined();
        expect(await withDetails(null)).toBeUndefined();
      });

      it('falls back field by field on the wrong types: min 1, max 99, mins 0, desc empty, only string keywords', async () => {
        const raw = '{"bggId":"1","year":"2000","min":"2","max":1e999,"mins":null,"desc":5,"kw":["party",1,null,"family"]}';
        expect(await withDetails(raw)).toEqual({ bggId: undefined, year: undefined, min: 1, max: 99, mins: 0, desc: '', kw: ['party', 'family'] });
        expect(await withDetails({})).toEqual({ bggId: undefined, year: undefined, min: 1, max: 99, mins: 0, desc: '', kw: [] });
      });
    });
  });

  describe('owner actions (session instead of emailed token)', () => {
    const JSON_H = { 'content-type': 'application/json' };
    const asOwner = (over: Partial<SuggestionsDeps> = {}) => deps({ admin: async () => true, ...over });
    const approvedItem = { ...pending, id: 'sug-ok', game: 'Root', status: 'approved', decidedAt: 2000, details: JSON.stringify({ min: 2, max: 4, mins: 90, desc: 'Woodland war.', kw: ['strategy'] }) };

    describe('GET ?action=pending', () => {
      it('is refused without a session', async () => {
        const res = makeRes();
        await handleSuggestions(deps(), { method: 'GET', query: { action: 'pending' } }, res);
        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({ error: 'owner sign-in required' });
        const noAdmin = makeRes();
        await handleSuggestions(deps({ admin: async () => false }), { method: 'GET', query: { action: 'pending' } }, noAdmin);
        expect(noAdmin.statusCode).toBe(403);
      });

      it('lists what still needs a decision, newest first, without tokens, including unsent ones', async () => {
        const redis = makeRedis({
          'suggestions:sug-old': { ...pending, id: 'sug-old', createdAt: 100 },
          'suggestions:sug-new': { ...pending, id: 'sug-new', createdAt: 300 },
          'suggestions:sug-unsent': { ...pending, id: 'sug-unsent', createdAt: 200, status: 'unsent' },
          'suggestions:sug-ok': approvedItem,
        }, { 'suggestions:active': ['sug-old', 'sug-ok', 'sug-new'], 'suggestions:unsent': ['sug-unsent', 'sug-old'] });
        const res = makeRes();
        await handleSuggestions(asOwner({ redis }), { method: 'GET', query: { action: 'pending' } }, res);
        expect(res.statusCode).toBe(200);
        const items = (res.body as { items: Array<Record<string, unknown>> }).items;
        expect(items.map((i) => i.id)).toEqual(['sug-new', 'sug-unsent', 'sug-old']);
        expect(items.every((i) => !('token' in i))).toBe(true);
        expect(items[0]).toMatchObject({ status: 'pending', source: 'friend' });
        expect(items[1]).toMatchObject({ status: 'unsent' });
      });

      it('drops an unsent record from the unsent list once the owner decides it', async () => {
        const redis = makeRedis({ 'suggestions:sug-unsent': { ...pending, id: 'sug-unsent', status: 'unsent' } }, { 'suggestions:unsent': ['sug-unsent', 'sug-other'] });
        const res = makeRes();
        await handleSuggestions(asOwner({ redis }), { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-unsent' }, headers: JSON_H }, res);
        expect(res.statusCode).toBe(200);
        expect(redis.lists['suggestions:unsent']).toEqual(['sug-other']);
        expect(redis.lists['suggestions:active']).toEqual(['sug-unsent']);
        expect(redis.lists['suggestions:approved']).toEqual(['sug-unsent']);
      });
    });

    describe('POST decision from the site', () => {
      const decideReq = (body: unknown, headers: Record<string, string> = JSON_H) => ({ method: 'POST', query: {}, body, headers });

      it('needs a JSON body as well as a session', async () => {
        const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
        const form = makeRes();
        await handleSuggestions(asOwner({ redis }), decideReq({ decision: 'approve', id: 'sug-aaaaaa' }, { 'content-type': 'application/x-www-form-urlencoded' }), form);
        expect(form.statusCode).toBe(403);
        expect(form.body).toEqual({ error: 'owner actions must be sent as JSON' });
        const anon = makeRes();
        await handleSuggestions(deps({ redis }), decideReq({ decision: 'approve', id: 'sug-aaaaaa' }), anon);
        expect(anon.statusCode).toBe(403);
        expect(redis.store['suggestions:sug-aaaaaa'].status).toBe('pending');
      });

      it('approves with enrichment and answers JSON, not a page', async () => {
        const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
        const lookup = vi.fn(async () => ({ bggId: 1, name: 'Wingspan', year: 2019, min: 1, max: 5, mins: 70, desc: 'Birds.', kw: ['strategy'] }));
        const res = makeRes();
        await handleSuggestions(asOwner({ redis, lookup }), decideReq({ decision: 'approve', id: 'sug-aaaaaa' }), res);
        expect(res.statusCode).toBe(200);
        expect(res.headers['Content-Type']).toBeUndefined();
        expect(res.body).toMatchObject({ item: { id: 'sug-aaaaaa', status: 'approved', decidedAt: 5000, details: { min: 1, max: 5, mins: 70, desc: 'Birds.' } } });
        expect((res.body as { item: Record<string, unknown> }).item.token).toBeUndefined();
        expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
        expect(lookup).toHaveBeenCalledWith('Wingspan');
      });

      it('denies, and refuses to decide twice', async () => {
        const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
        const res = makeRes();
        await handleSuggestions(asOwner({ redis }), decideReq({ decision: 'deny', id: 'sug-aaaaaa' }), res);
        expect(res.body).toMatchObject({ item: { status: 'denied' } });
        expect(redis.lists['suggestions:active']).toEqual([]);
        const again = makeRes();
        await handleSuggestions(asOwner({ redis }), decideReq({ decision: 'approve', id: 'sug-aaaaaa' }), again);
        expect(again.statusCode).toBe(409);
        expect(again.body).toEqual({ error: 'Wingspan was already denied' });
      });

      it('reports a bad or unknown id', async () => {
        const bad = makeRes();
        await handleSuggestions(asOwner(), decideReq({ decision: 'approve', id: 'Not A Slug' }), bad);
        expect(bad.statusCode).toBe(400);
        expect(bad.body).toEqual({ error: 'invalid id' });
        const missing = makeRes();
        await handleSuggestions(asOwner(), decideReq({ decision: 'approve', id: 'sug-nope' }), missing);
        expect(missing.statusCode).toBe(404);
      });
    });

    describe('POST action=add (straight onto the wishlist)', () => {
      const add = async (body: Record<string, unknown>, d = asOwner()) => {
        const res = makeRes();
        await handleSuggestions(d, { method: 'POST', query: {}, body: { action: 'add', game: 'Cascadia', name: 'Jess', ...body }, headers: JSON_H }, res);
        return res;
      };

      it('is refused without a session and sends no email', async () => {
        const d = deps();
        const res = await add({}, d);
        expect(res.statusCode).toBe(403);
        expect(d.sent).toHaveLength(0);
      });

      it('stores it approved, credited to the owner, listed and enriched, with the chosen section', async () => {
        const lookup = vi.fn(async () => ({ bggId: 7, name: 'Cascadia', year: 2021, min: 1, max: 4, mins: 45, desc: 'Tile laying.', kw: ['family'] }));
        const d = asOwner({ lookup });
        const res = await add({ type: 'strategy', note: 'Calm' }, d);
        expect(res.statusCode).toBe(201);
        expect(res.body).toMatchObject({ item: {
          id: 'sug-bbbbbb', game: 'Cascadia', name: 'Jess', note: 'Calm', status: 'approved', source: 'owner', createdAt: 5000, decidedAt: 5000,
          details: { min: 1, max: 4, mins: 45, desc: 'Tile laying.', kw: ['family'], type: 'strategy' },
        } });
        const redis = d.redis as ReturnType<typeof makeRedis>;
        expect(redis.lists['suggestions:approved']).toEqual(['sug-bbbbbb']);
        expect(redis.lists['suggestions:active']).toEqual(['sug-bbbbbb']);
        expect(d.sent).toHaveLength(0);
      });

      it('keeps the chosen section even when BoardGameGeek has nothing, and no details otherwise', async () => {
        const typed = await add({ type: 'party' }, asOwner({ lookup: async () => null }));
        expect(typed.body).toMatchObject({ item: { details: { min: 1, max: 99, mins: 0, desc: '', kw: [], type: 'party' } } });
        const untyped = await add({}, asOwner({ lookup: async () => null }));
        expect((untyped.body as { item: { details?: unknown } }).item.details).toBeUndefined();
      });

      it('validates the game, the name and the section', async () => {
        expect((await add({ game: 'X' })).body).toEqual({ error: 'game must be 2–80 characters' });
        expect((await add({ name: '!!' })).statusCode).toBe(400);
        expect((await add({ type: 'suggested' })).body).toEqual({ error: 'unknown wishlist type' });
        expect((await add({ note: 'x'.repeat(201) })).statusCode).toBe(400);
      });

      it('refuses a game already on the list', async () => {
        const redis = makeRedis({ 'suggestions:sug-ok': approvedItem }, { 'suggestions:active': ['sug-ok'] });
        const res = await add({ game: 'root' }, asOwner({ redis }));
        expect(res.statusCode).toBe(409);
        expect(res.body).toEqual({ error: 'Root is already on the list' });
      });

      it('rejects an unknown action rather than treating it as a suggestion', async () => {
        const d = deps();
        const res = makeRes();
        await handleSuggestions(d, { method: 'POST', query: {}, body: { action: 'x', game: 'Cascadia', name: 'Sam' } }, res);
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'unknown action' });
        expect(d.sent).toHaveLength(0);
      });
    });

    describe('PATCH (editing how a game reads)', () => {
      const patch = async (body: Record<string, unknown>, d = asOwner({ redis: makeRedis({ 'suggestions:sug-ok': approvedItem }, { 'suggestions:approved': ['sug-ok'] }) })) => {
        const res = makeRes();
        await handleSuggestions(d, { method: 'PATCH', query: {}, body: { id: 'sug-ok', ...body }, headers: JSON_H }, res);
        return { res, redis: d.redis as ReturnType<typeof makeRedis> };
      };

      it('is refused without a JSON body or a session', async () => {
        const res = makeRes();
        await handleSuggestions(asOwner(), { method: 'PATCH', query: {}, body: { id: 'sug-ok' } }, res);
        expect(res.statusCode).toBe(403);
        const anon = makeRes();
        await handleSuggestions(deps(), { method: 'PATCH', query: {}, body: { id: 'sug-ok' }, headers: JSON_H }, anon);
        expect(anon.statusCode).toBe(403);
      });

      it('merges the given details over the stored ones and renames', async () => {
        const { res, redis } = await patch({ game: '  Root:  A Game  ', note: 'Mean', details: { mins: 60, kw: ['strategy', 'thematic', 'strategy'], type: 'heavy' } });
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ item: { game: 'Root: A Game', note: 'Mean', details: { min: 2, max: 4, mins: 60, desc: 'Woodland war.', kw: ['strategy', 'thematic'], type: 'heavy' } } });
        expect(JSON.parse(String(redis.store['suggestions:sug-ok'].details))).toMatchObject({ mins: 60, type: 'heavy' });
      });

      it('clears the section with null and folds the textarea\'s line breaks into the description', async () => {
        const { res } = await patch({ details: { type: null, desc: '  Two \n\n lines. ' } });
        const details = (res.body as { item: { details: Record<string, unknown> } }).item.details;
        expect(details.type).toBeUndefined();
        expect(details.desc).toBe('Two lines.');
      });

      it('rejects out-of-range or malformed edits with the reason', async () => {
        expect((await patch({ details: { min: 5, max: 2 } })).res.body).toEqual({ error: 'players must be whole numbers from 1 to 99, min at most max' });
        expect((await patch({ details: { mins: 601 } })).res.body).toEqual({ error: 'minutes must be a whole number from 0 to 600' });
        expect((await patch({ details: { min: 1.5 } })).res.statusCode).toBe(400);
        expect((await patch({ details: { desc: 'x'.repeat(601) } })).res.statusCode).toBe(400);
        expect((await patch({ details: { kw: ['Not Valid'] } })).res.body).toEqual({ error: 'keywords must be a short list of keyword ids' });
        expect((await patch({ details: { kw: ['not-a-real-keyword'] } })).res.statusCode).toBe(400);
        expect((await patch({ details: { kw: [42] } })).res.statusCode).toBe(400);
        expect((await patch({ details: { type: 'suggested' } })).res.body).toEqual({ error: 'unknown wishlist type' });
        expect((await patch({ details: 'nope' })).res.body).toEqual({ error: 'details must be an object' });
        expect((await patch({ game: 'X' })).res.statusCode).toBe(400);
        expect((await patch({ note: 42 })).res.statusCode).toBe(400);
        expect((await patch({})).res.body).toEqual({ error: 'nothing to change' });
      });

      it('starts from defaults when a game has no details yet', async () => {
        const redis = makeRedis({ 'suggestions:sug-bare': { ...pending, id: 'sug-bare', status: 'approved' } });
        const res = makeRes();
        await handleSuggestions(asOwner({ redis }), { method: 'PATCH', query: {}, body: { id: 'sug-bare', details: { mins: 30 } }, headers: JSON_H }, res);
        expect(res.body).toMatchObject({ item: { details: { min: 1, max: 99, mins: 30, desc: '', kw: [] } } });
      });

      it('will not edit a removed or denied game, or one that does not exist', async () => {
        const redis = makeRedis({ 'suggestions:sug-gone': { ...pending, id: 'sug-gone', status: 'removed' } });
        const res = makeRes();
        await handleSuggestions(asOwner({ redis }), { method: 'PATCH', query: {}, body: { id: 'sug-gone', game: 'Root' }, headers: JSON_H }, res);
        expect(res.statusCode).toBe(409);
        const missing = makeRes();
        await handleSuggestions(asOwner({ redis }), { method: 'PATCH', query: {}, body: { id: 'sug-nope', game: 'Root' }, headers: JSON_H }, missing);
        expect(missing.statusCode).toBe(404);
      });
    });

    describe('DELETE (taking a game off)', () => {
      it('drops it from both lists and marks it removed, keeping the hash', async () => {
        const redis = makeRedis({ 'suggestions:sug-ok': approvedItem }, { 'suggestions:approved': ['sug-ok', 'sug-other'], 'suggestions:active': ['sug-ok'] });
        const res = makeRes();
        await handleSuggestions(asOwner({ redis }), { method: 'DELETE', query: {}, body: { id: 'sug-ok' }, headers: JSON_H }, res);
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ ok: true });
        expect(redis.lists['suggestions:approved']).toEqual(['sug-other']);
        expect(redis.lists['suggestions:active']).toEqual([]);
        expect(redis.store['suggestions:sug-ok']).toMatchObject({ status: 'removed', decidedAt: 5000, game: 'Root' });
        // A later public read no longer shows it.
        const list = makeRes();
        await handleSuggestions(asOwner({ redis }), { method: 'GET', query: {} }, list);
        expect((list.body as { items: unknown[] }).items).toEqual([]);
      });

      it('only removes what is on the wishlist: a pending or already-removed record answers 409 untouched', async () => {
        for (const status of ['pending', 'unsent', 'denied', 'removed']) {
          const redis = makeRedis({ 'suggestions:sug-x': { ...pending, id: 'sug-x', status } }, { 'suggestions:active': ['sug-x'], 'suggestions:unsent': ['sug-x'] });
          const res = makeRes();
          await handleSuggestions(asOwner({ redis }), { method: 'DELETE', query: {}, body: { id: 'sug-x' }, headers: JSON_H }, res);
          expect(res.statusCode).toBe(409);
          expect(res.body).toEqual({ error: 'Wingspan is not on the wishlist' });
          expect(redis.store['suggestions:sug-x'].status).toBe(status);
          expect(redis.lists['suggestions:active']).toEqual(['sug-x']);
          expect(redis.lists['suggestions:unsent']).toEqual(['sug-x']);
        }
      });

      it('is refused without a session and reports an unknown id', async () => {
        const anon = makeRes();
        await handleSuggestions(deps(), { method: 'DELETE', query: {}, body: { id: 'sug-ok' }, headers: JSON_H }, anon);
        expect(anon.statusCode).toBe(403);
        const missing = makeRes();
        await handleSuggestions(asOwner(), { method: 'DELETE', query: {}, body: { id: 'sug-nope' }, headers: JSON_H }, missing);
        expect(missing.statusCode).toBe(404);
      });
    });

    it('knows the same keyword ids and wishlist sections as the client', () => {
      expect([...KEYWORD_IDS].sort()).toEqual(Object.keys(KW).sort());
      expect([...WISHLIST_SECTION_IDS].sort()).toEqual([...WISHLIST_SECTIONS].sort());
    });

    it('recognises a removed status and a stored section when parsing', async () => {
      const redis = makeRedis({
        'suggestions:sug-gone': { ...approvedItem, id: 'sug-gone', status: 'removed' },
        'suggestions:sug-typed': { ...approvedItem, id: 'sug-typed', source: 'owner', details: JSON.stringify({ min: 2, max: 4, mins: 30, desc: '', kw: [], type: 'party' }) },
      }, { 'suggestions:approved': ['sug-gone', 'sug-typed'] });
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: {} }, res);
      const items = (res.body as { items: Array<Record<string, unknown>> }).items;
      expect(items.map((i) => i.id)).toEqual(['sug-typed']);
      expect(items[0]).toMatchObject({ source: 'owner', details: { type: 'party' } });
    });
  });
});
