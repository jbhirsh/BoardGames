import { describe, it, expect, vi } from 'vitest';

// The lookup's token reports go through reportError; spied here so a test
// can see them without a Sentry client, while failWith500 keeps its own.
vi.mock('../../api/_lib/sentry.js', async (importActual) => ({
  ...(await importActual<typeof import('../../api/_lib/sentry')>()),
  reportError: vi.fn(async () => {}),
}));
import {
  handleSuggestions,
  KEYWORD_IDS,
  KEYWORD_LABELS,
  WISHLIST_SECTION_IDS,
  NAME_RE,
  GAME_MIN,
  GAME_MAX,
  NOTE_MAX,
  DESC_MAX,
  MINS_MAX,
  PLAYERS_MAX,
  type SuggestionsDeps,
  type SuggestionsRedis,
  type SuggestionsResponse,
  type SuggestionsRequest,
  type Mail,
} from '../../api/suggestions';
import { resendMailer } from '../../api/_lib/mail';
import { reportError } from '../../api/_lib/sentry';
import { KW, WISHLIST_SECTIONS } from '../data/keywords';
import * as clientLimits from '../data/suggestionLimits';
import { fakeRedis, type FakeRedisSeed } from './helpers/fakeRedis';
import { parseThing, type GameDetails, type LookupResult } from '../../api/_lib/bgg';
import { abortReason } from './helpers/abortReason';

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res as unknown as SuggestionsResponse;
    },
    json(data: unknown) {
      res.body = data;
      return res as unknown as SuggestionsResponse;
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value;
      return res as unknown as SuggestionsResponse;
    },
    send(body: string) {
      res.body = body;
      return res as unknown as SuggestionsResponse;
    },
  };
  return res;
}

/** Suggestion hashes and id lists, as the handler's raw client answers. */
const makeRedis = (hashes: FakeRedisSeed['hashes'] = {}, lists: FakeRedisSeed['lists'] = {}) =>
  fakeRedis({ hashes, lists, raw: true });

// Deliberately low-entropy so secret scanners don't mistake them for keys.
const TOKEN = 'test-token-' + 'a'.repeat(21);
const NEW_TOKEN = 'test-token-' + 'b'.repeat(21);
const pending = {
  id: 'sug-aaaaaa',
  game: 'Wingspan',
  name: 'Alex',
  note: 'Great engine builder',
  status: 'pending',
  createdAt: 1000,
  token: TOKEN,
};

function deps(over: Partial<SuggestionsDeps> = {}): SuggestionsDeps & { sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    redis: makeRedis(),
    mailer: {
      send: vi.fn(async (m: Mail) => {
        sent.push(m);
      }),
    },
    baseUrl: () => 'https://games.example',
    now: () => 5000,
    randomId: () => 'sug-bbbbbb',
    randomToken: () => NEW_TOKEN,
    sent,
    ...over,
  };
}

const found = (details: GameDetails): LookupResult => ({ outcome: 'found', details });
const NO_MATCH: LookupResult = { outcome: 'no-match' };

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
      const redis = makeRedis(
        {
          'suggestions:sug-a': { ...pending, id: 'sug-a', status: 'approved', decidedAt: 10 },
          'suggestions:sug-b': { ...pending, id: 'sug-b', game: 'Azul', status: 'approved', decidedAt: 20 },
          'suggestions:sug-d': { ...pending, id: 'sug-d', game: 'Later' },
        },
        { 'suggestions:approved': ['sug-a', 'sug-b'], 'suggestions:active': ['sug-d', 'sug-b', 'sug-a'] },
      );
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: {} }, res);
      expect(res.statusCode).toBe(200);
      const items = (res.body as { items: Array<Record<string, unknown>> }).items;
      expect(items.map((i) => i.game)).toEqual(['Azul', 'Wingspan']);
      expect(items[0]).not.toHaveProperty('token');
      expect(redis.lrange).toHaveBeenCalledWith('suggestions:approved', 0, -1);
    });

    it('reads stored values as text, so a game called 1830 survives', async () => {
      const redis = makeRedis(
        {
          'suggestions:sug-n': {
            ...pending,
            id: 'sug-n',
            game: 1830,
            name: 42,
            note: true,
            status: 'approved',
            decidedAt: 1,
          },
        },
        { 'suggestions:approved': ['sug-n'] },
      );
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: {} }, res);
      expect((res.body as { items: Array<{ game: string; name: string; note: string }> }).items[0]).toMatchObject({
        game: '1830',
        name: '42',
        note: 'true',
      });
    });

    it.each(['null', 'true', '1.50', '007'])(
      'keeps a game called %s as written, through the duplicate check, its links and the list',
      async (game) => {
        const d = deps();
        const post = async (body: Record<string, unknown>) => {
          const res = makeRes();
          await handleSuggestions(d, { method: 'POST', query: {}, body }, res);
          return res;
        };
        expect((await post({ game, name: 'Sam' })).statusCode).toBe(201);
        expect((await post({ game, name: 'Kim' })).statusCode).toBe(409);
        const approve = await post({ decision: 'approve', id: 'sug-bbbbbb', token: NEW_TOKEN });
        expect(approve.statusCode).toBe(200);
        expect(String(approve.body)).toContain(`${game} is now on the wishlist`);
        const res = makeRes();
        await handleSuggestions(d, { method: 'GET', query: {} }, res);
        expect((res.body as { items: Array<{ game: string }> }).items.map((i) => i.game)).toEqual([game]);
      },
    );

    it('shows a game once even if its id is listed twice', async () => {
      const redis = makeRedis(
        {
          'suggestions:sug-a': { ...pending, id: 'sug-a', status: 'approved', decidedAt: 10 },
        },
        { 'suggestions:approved': ['sug-a', 'sug-a'] },
      );
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: {} }, res);
      expect((res.body as { items: Array<{ id: string }> }).items.map((i) => i.id)).toEqual(['sug-a']);
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
      await handleSuggestions(
        deps({ redis }),
        { method: 'GET', query: { action: 'approve', id: 'sug-zzzzzz', token: TOKEN } },
        res,
      );
      expect(res.statusCode).toBe(404);
      res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'GET', query: { action: 'approve', id: 'sug-aaaaaa', token: 'test-token-' + 'z'.repeat(21) } },
        res,
      );
      expect(res.statusCode).toBe(403);
    });

    it('answers a bad, unknown or mismatched link with a page, keeping the status', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
      for (const [query, code, title] of [
        [{ action: 'approve', id: 'sug-aaaaaa' }, 400, 'Link not recognised'],
        [{ action: 'deny', id: 'Bad!', token: TOKEN }, 400, 'Link not recognised'],
        [{ action: 'approve', id: 'sug-zzzzzz', token: TOKEN }, 404, 'Suggestion not found'],
        [{ action: 'approve', id: 'sug-aaaaaa', token: 'test-token-' + 'z'.repeat(21) }, 403, 'Link not valid'],
      ] as const) {
        const res = makeRes();
        await handleSuggestions(deps({ redis }), { method: 'GET', query }, res);
        expect(res.statusCode, title).toBe(code);
        expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
        expect(String(res.body)).toContain(`<h1>${title}</h1>`);
        expect(String(res.body)).toContain('name="robots" content="noindex"');
      }
    });

    it('never mutates on GET: renders a confirmation form carrying the decision', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
      const res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'GET', query: { action: 'deny', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
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
      await handleSuggestions(
        deps({ redis }),
        { method: 'GET', query: { action: 'deny', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
      expect(String(res.body)).toContain('Already approved');
      expect(String(res.body)).not.toContain('method="post"');
    });

    it('escapes game and name in the page', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': { ...pending, game: '<b>x</b>', name: 'A&B' } });
      const res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'GET', query: { action: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
      expect(String(res.body)).toContain('&lt;b&gt;x&lt;/b&gt;');
      expect(String(res.body)).toContain('A&amp;B');
      expect(String(res.body)).not.toContain('<b>x</b>');
    });
  });

  describe('POST decision', () => {
    it('approves: flips status, adds to the approved list, keeps it active', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
      const res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
      expect(res.statusCode).toBe(200);
      expect(redis.hset).toHaveBeenCalledWith('suggestions:sug-aaaaaa', { status: 'approved', decidedAt: 5000 });
      expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
      expect(redis.lists['suggestions:active']).toEqual(['sug-aaaaaa']);
      expect(String(res.body)).toContain('Approved');
      expect(String(res.body)).toContain('Alex');
    });

    it('approving looks the game up and stores its details; the public list returns them', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
      const lookup = vi.fn(async () =>
        found({
          bggId: 266192,
          name: 'Wingspan',
          year: 2019,
          min: 1,
          max: 5,
          mins: 70,
          desc: 'Birds.',
          kw: ['strategy'],
        }),
      );
      await handleSuggestions(
        deps({ redis, lookup }),
        { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        makeRes(),
      );
      expect(lookup).toHaveBeenCalledWith('Wingspan');
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: {} }, res);
      const [item] = (res.body as { items: Array<{ details?: Record<string, unknown> }> }).items;
      expect(item.details).toEqual({
        bggId: 266192,
        year: 2019,
        min: 1,
        max: 5,
        mins: 70,
        desc: 'Birds.',
        kw: ['strategy'],
      });
    });

    it('lists the game as approved before the lookup runs, so a hung lookup cannot strand it', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
      let listedWhenLookedUp: string[] | undefined;
      const lookup = vi.fn(async () => {
        listedWhenLookedUp = [...(redis.lists['suggestions:approved'] ?? [])];
        return NO_MATCH;
      });
      await handleSuggestions(
        deps({ redis, lookup }),
        { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        makeRes(),
      );
      expect(listedWhenLookedUp).toEqual(['sug-aaaaaa']);
    });

    it('still approves when the lookup finds nothing or throws', async () => {
      for (const lookup of [
        vi.fn(async () => NO_MATCH),
        vi.fn(async () => {
          throw new Error('bgg down');
        }),
      ]) {
        const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
        const res = makeRes();
        await handleSuggestions(
          deps({ redis, lookup }),
          { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
          res,
        );
        expect(res.statusCode).toBe(200);
        expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
        expect(redis.hashes['suggestions:sug-aaaaaa'].details).toBeUndefined();
      }
    });

    it('denies: flips status and drops it from the active list', async () => {
      const redis = makeRedis(
        { 'suggestions:sug-aaaaaa': pending },
        { 'suggestions:active': ['sug-aaaaaa', 'sug-other'] },
      );
      const res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'POST', query: {}, body: { decision: 'deny', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
      expect(redis.hset).toHaveBeenCalledWith('suggestions:sug-aaaaaa', { status: 'denied', decidedAt: 5000 });
      expect(redis.lists['suggestions:active']).toEqual(['sug-other']);
      expect(redis.lists['suggestions:approved']).toBeUndefined();
      expect(String(res.body)).toContain('Denied');
    });

    it('approves once when the same approval arrives twice at the same moment', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
      const lookup = vi.fn(async () =>
        found({
          bggId: 266192,
          name: 'Wingspan',
          year: 2019,
          min: 1,
          max: 5,
          mins: 70,
          desc: 'Birds.',
          kw: ['strategy'],
        }),
      );
      const owner = { ...deps({ redis, lookup }), admin: async () => true };
      const byEmail = makeRes();
      const bySite = makeRes();
      const twice = makeRes();
      await Promise.all([
        handleSuggestions(
          deps({ redis, lookup }),
          { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
          byEmail,
        ),
        handleSuggestions(
          deps({ redis, lookup }),
          { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
          twice,
        ),
        handleSuggestions(
          owner,
          {
            method: 'POST',
            query: {},
            body: { decision: 'approve', id: 'sug-aaaaaa' },
            headers: { 'content-type': 'application/json' },
          },
          bySite,
        ),
      ]);
      expect(String(byEmail.body)).toContain('is now on the wishlist');
      expect(String(twice.body)).toContain('Already');
      expect(bySite.statusCode).toBe(409);
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
      expect(redis.lists['suggestions:active']).toEqual(['sug-aaaaaa']);
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: {} }, res);
      expect((res.body as { items: Array<{ id: string }> }).items.map((i) => i.id)).toEqual(['sug-aaaaaa']);
    });

    it('lists an id once even if the approved list already held it', async () => {
      const redis = makeRedis(
        { 'suggestions:sug-aaaaaa': pending },
        { 'suggestions:active': ['sug-aaaaaa'], 'suggestions:approved': ['sug-aaaaaa'] },
      );
      await handleSuggestions(
        deps({ redis }),
        { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        makeRes(),
      );
      expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
    });

    it('gives the claim back when the writes fail, so the decision can be retried', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
      const multi = redis.multi;
      redis.multi = vi.fn(() => {
        const tx = multi();
        tx.exec = async () => {
          throw new Error('redis down');
        };
        return tx;
      });
      const failed = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        failed,
      );
      expect(failed.statusCode).toBe(500);
      expect(redis.hashes['suggestions:sug-aaaaaa'].decidedAt).toBeUndefined();
      redis.multi = multi;
      const retry = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        retry,
      );
      expect(String(retry.body)).toContain('is now on the wishlist');
      expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
    });

    it('takes over a claim whose decision never landed, once it is a minute old', async () => {
      const stuck = { ...pending, decidedAt: 1000 };
      const fresh = makeRedis({ 'suggestions:sug-aaaaaa': stuck }, { 'suggestions:active': ['sug-aaaaaa'] });
      const held = makeRes();
      await handleSuggestions(
        deps({ redis: fresh, now: () => 1000 + 59_999 }),
        { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        held,
      );
      expect(String(held.body)).toContain('Already');
      expect(fresh.lists['suggestions:approved']).toBeUndefined();

      const stale = makeRedis({ 'suggestions:sug-aaaaaa': stuck }, { 'suggestions:active': ['sug-aaaaaa'] });
      const res = makeRes();
      await handleSuggestions(
        deps({ redis: stale, now: () => 1000 + 60_000 }),
        { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
      expect(String(res.body)).toContain('is now on the wishlist');
      expect(stale.hashes['suggestions:sug-aaaaaa']).toMatchObject({ status: 'approved', decidedAt: 61_000 });
      expect(stale.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
    });

    it('lets only one of two requests take over the same abandoned claim', async () => {
      const redis = makeRedis(
        { 'suggestions:sug-aaaaaa': { ...pending, decidedAt: 1000 } },
        { 'suggestions:active': ['sug-aaaaaa'] },
      );
      const lookup = vi.fn(async () => NO_MATCH);
      const late = deps({ redis, lookup, now: () => 1000 + 60_000 });
      const [a, b] = [makeRes(), makeRes()];
      await Promise.all([
        handleSuggestions(
          late,
          { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
          a,
        ),
        handleSuggestions(
          late,
          { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
          b,
        ),
      ]);
      expect([String(a.body), String(b.body)].filter((body) => body.includes('is now on the wishlist'))).toHaveLength(
        1,
      );
      expect([String(a.body), String(b.body)].filter((body) => body.includes('Already'))).toHaveLength(1);
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
    });

    it('does not change an already-decided suggestion', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': { ...pending, status: 'denied', decidedAt: 10 } });
      const res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
      expect(redis.hset).not.toHaveBeenCalled();
      expect(String(res.body)).toContain('Already denied');
    });

    it('rejects an unknown decision and a bad token', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
      let res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'POST', query: {}, body: { decision: 'maybe', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
      expect(res.statusCode).toBe(400);
      res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        {
          method: 'POST',
          query: {},
          body: { decision: 'approve', id: 'sug-aaaaaa', token: 'test-token-' + 'z'.repeat(21) },
        },
        res,
      );
      expect(res.statusCode).toBe(403);
      expect(redis.hset).not.toHaveBeenCalled();
    });
  });

  describe('unsent records (send call failed after possible delivery)', () => {
    const unsent = { ...pending, status: 'unsent' };

    it('still offers the confirmation form from the emailed link', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': unsent });
      const res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'GET', query: { action: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
      expect(String(res.body)).toContain('Approve Wingspan?');
      expect(String(res.body)).toContain('method="post"');
    });

    it('approving puts it back on the active list as well as the approved list', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': unsent }, { 'suggestions:active': [] });
      const res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
      expect(String(res.body)).toContain('Approved');
      expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
      expect(redis.lists['suggestions:active']).toEqual(['sug-aaaaaa']);
    });

    it('denying leaves it out of both lists', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': unsent }, { 'suggestions:active': [] });
      const res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'POST', query: {}, body: { decision: 'deny', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
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
      redis.hset = vi.fn(async (key, fields) => {
        order.push(`hset:${key}`);
        redis.hashes[key] = { ...(redis.hashes[key] ?? {}), ...fields };
        return 1;
      });
      const mailer = {
        send: vi.fn(async () => {
          order.push('send');
        }),
      };
      await handleSuggestions(deps({ redis, mailer }), { method: 'POST', query: {}, body: valid }, makeRes());
      expect(order).toEqual(['hset:suggestions:sug-bbbbbb', 'send']);
    });

    it('emails the owner links to the confirmation page and stores it as pending and active', async () => {
      const d = deps();
      const res = makeRes();
      await handleSuggestions(d, { method: 'POST', query: {}, body: { ...valid, game: '  Cascadia   ' } }, res);
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({
        item: {
          id: 'sug-bbbbbb',
          game: 'Cascadia',
          name: 'Sam',
          note: 'Calm and quick',
          status: 'pending',
          createdAt: 5000,
          source: 'friend',
        },
      });

      expect(d.sent).toHaveLength(1);
      expect(d.sent[0].subject).toBe('Game suggestion: Cascadia (from Sam)');
      expect(d.sent[0].html).toContain(
        `https://games.example/api/suggestions?action=approve&id=sug-bbbbbb&token=${NEW_TOKEN}`,
      );
      expect(d.sent[0].html).toContain('action=deny&id=sug-bbbbbb');
      expect(d.sent[0].html).toContain('Calm and quick');

      expect(d.redis.hset).toHaveBeenCalledWith(
        'suggestions:sug-bbbbbb',
        expect.objectContaining({ game: 'Cascadia', name: 'Sam', status: 'pending', token: NEW_TOKEN }),
      );
      expect(d.redis.lpush).toHaveBeenCalledWith('suggestions:active', 'sug-bbbbbb');
      expect(d.redis.lpush).not.toHaveBeenCalledWith('suggestions:approved', expect.anything());
    });

    it('escapes suggester text in the email', async () => {
      const d = deps();
      await handleSuggestions(
        d,
        { method: 'POST', query: {}, body: { ...valid, game: 'Tak <3', note: '<img src=x>' } },
        makeRes(),
      );
      expect(d.sent[0].html).toContain('Tak &lt;3');
      expect(d.sent[0].html).toContain('&lt;img src=x&gt;');
    });

    it('leaves a suggestion the owner decided while the email was failing as decided', async () => {
      const redis = makeRedis();
      const send = vi.fn(async () => {
        // The owner approves it from the site's queue before the send gives up.
        await redis.hset('suggestions:sug-bbbbbb', { status: 'approved', decidedAt: 4000 });
        await redis.lpush('suggestions:approved', 'sug-bbbbbb');
        throw new Error('resend timed out');
      });
      const res = makeRes();
      await handleSuggestions(deps({ redis, mailer: { send } }), { method: 'POST', query: {}, body: valid }, res);
      expect(res.statusCode).toBe(500);
      expect(redis.hashes['suggestions:sug-bbbbbb'].status).toBe('approved');
      expect(redis.lists['suggestions:active']).toEqual(['sug-bbbbbb']);
      expect(redis.lists['suggestions:unsent']).toBeUndefined();
    });

    it('rolls the record out of the active list when the email fails, so a retry is not a duplicate', async () => {
      const redis = makeRedis();
      const d = deps({
        redis,
        mailer: {
          send: vi.fn(async () => {
            throw new Error('resend down');
          }),
        },
      });
      let res = makeRes();
      await handleSuggestions(d, { method: 'POST', query: {}, body: valid }, res);
      expect(res.statusCode).toBe(500);
      expect(redis.lists['suggestions:active']).toEqual([]);
      expect(redis.hashes['suggestions:sug-bbbbbb'].status).toBe('unsent');
      // Tracked so the owner's on-site queue can still surface it.
      expect(redis.lists['suggestions:unsent']).toEqual(['sug-bbbbbb']);

      const ok = deps({ redis, randomId: () => 'sug-cccccc' });
      res = makeRes();
      await handleSuggestions(ok, { method: 'POST', query: {}, body: valid }, res);
      expect(res.statusCode).toBe(201);
      expect(ok.sent).toHaveLength(1);
    });

    it('marks it unsent when Resend hangs, rather than waiting out the function', async () => {
      vi.stubEnv('RESEND_API_KEY', 're_test');
      vi.stubEnv('SUGGESTIONS_TO', 'owner@example.com');
      try {
        // Answers only by failing once the mailer's timeout aborts it.
        const hanging = vi.fn(
          (_url: string | URL | Request, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(abortReason(init.signal)));
            }),
        );
        const redis = makeRedis();
        const res = makeRes();
        await handleSuggestions(
          deps({ redis, mailer: resendMailer(hanging, 10) }),
          { method: 'POST', query: {}, body: valid },
          res,
        );
        expect(hanging).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(500);
        expect(redis.hashes['suggestions:sug-bbbbbb'].status).toBe('unsent');
        expect(redis.lists['suggestions:active']).toEqual([]);
        expect(redis.lists['suggestions:unsent']).toEqual(['sug-bbbbbb']);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('does not email when the store itself fails', async () => {
      const redis = makeRedis();
      redis.hset = vi.fn(async () => {
        throw new Error('redis down');
      });
      const d = deps({ redis });
      const res = makeRes();
      await handleSuggestions(d, { method: 'POST', query: {}, body: valid }, res);
      expect(res.statusCode).toBe(500);
      expect(d.sent).toHaveLength(0);
    });

    it('never touches the base URL on reads, only when sending', async () => {
      const baseUrl = vi.fn(() => {
        throw new Error('APP_URL must be set');
      });
      const res = makeRes();
      await handleSuggestions(deps({ baseUrl }), { method: 'GET', query: {} }, res);
      expect(res.statusCode).toBe(200);
      expect(baseUrl).not.toHaveBeenCalled();
    });

    it('rejects a game already pending or approved, but allows one that was denied', async () => {
      const redis = makeRedis(
        {
          'suggestions:sug-p': { ...pending, id: 'sug-p', game: 'Cascadia!' },
          'suggestions:sug-a': { ...pending, id: 'sug-a', game: 'Azul', status: 'approved', decidedAt: 1 },
          'suggestions:sug-d': { ...pending, id: 'sug-d', game: 'Root', status: 'denied', decidedAt: 1 },
        },
        { 'suggestions:active': ['sug-p', 'sug-a'], 'suggestions:approved': ['sug-a'] },
      );
      let res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'POST', query: {}, body: { ...valid, game: 'cascadia' } },
        res,
      );
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
      const res = await post(
        { game: '  Terra   Mystica \t Rules ', name: '  Sam  ', note: ' so   good\n\nreally ' },
        d,
      );
      expect(res.statusCode).toBe(201);
      expect(d.redis.hset).toHaveBeenCalledWith('suggestions:sug-bbbbbb', {
        id: 'sug-bbbbbb',
        game: 'Terra Mystica Rules',
        name: 'Sam',
        note: 'so good really',
        status: 'pending',
        createdAt: 5000,
        token: NEW_TOKEN,
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
      const redis = makeRedis(
        {
          'suggestions:sug-d': { ...pending, id: 'sug-d', game: 'Root', status: 'denied', decidedAt: 1 },
        },
        { 'suggestions:active': ['sug-d'] },
      );
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'POST', query: {}, body: { ...valid, game: 'Root' } }, res);
      expect(res.statusCode).toBe(201);
    });

    it('ignores punctuation and whitespace differences when spotting a duplicate', async () => {
      const redis = makeRedis(
        {
          'suggestions:sug-w': { ...pending, id: 'sug-w', game: '7 Wonders' },
        },
        { 'suggestions:active': ['sug-w'] },
      );
      const res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'POST', query: {}, body: { ...valid, game: '7 - Wonders!!' } },
        res,
      );
      expect(res.statusCode).toBe(409);
      expect(res.body).toEqual({ error: '7 Wonders has already been suggested and is waiting for approval' });
    });
  });

  describe('decision links: authorisation edge cases', () => {
    const decide = async (redis: SuggestionsRedis, body: Record<string, unknown>) => {
      const res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN, ...body } },
        res,
      );
      return res;
    };

    it('400s on an id that names one of the id lists, without reading it as a suggestion', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
      for (const id of ['active', 'approved', 'unsent']) {
        const res = await decide(redis, { id });
        expect(res.statusCode, id).toBe(400);
        expect(res.headers['Content-Type']).toContain('text/html');
        const link = makeRes();
        await handleSuggestions(
          deps({ redis }),
          { method: 'GET', query: { action: 'approve', id, token: TOKEN } },
          link,
        );
        expect(link.statusCode, id).toBe(400);
      }
      expect(redis.hgetall).not.toHaveBeenCalled();
    });

    it('403s, rather than crashing, on a well-formed token of a different length', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
      const res = await decide(redis, { token: 'test-token-' + 'a'.repeat(9) });
      expect(res.statusCode).toBe(403);
      expect(res.headers['Content-Type']).toContain('text/html');
      expect(String(res.body)).toContain('Link not valid');
      expect(redis.hset).not.toHaveBeenCalled();
    });

    it('400s on tokens with a stray character at either end, or over 64 chars', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
      for (const token of ['!' + 'a'.repeat(20), 'a'.repeat(20) + '!', 'a'.repeat(65)]) {
        const res = await decide(redis, { token });
        expect(res.statusCode, token).toBe(400);
        expect(String(res.body)).toContain('Link not recognised');
      }
    });

    it('400s on a non-string id or token instead of coercing them', async () => {
      const redis = makeRedis({ 'suggestions:7': { ...pending, id: '7' }, 'suggestions:sug-aaaaaa': pending });
      for (const body of [{ id: 7 }, { token: 1e19 }, { id: undefined }]) {
        const res = await decide(redis, body);
        expect(res.statusCode, JSON.stringify(body)).toBe(400);
        expect(String(res.body)).toContain('Link not recognised');
      }
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: { action: 'approve', token: TOKEN } }, res);
      expect(res.statusCode).toBe(400);
    });

    it('reports the exact bodies for an unknown id, action and decision', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
      let res = await decide(redis, { id: 'sug-zzzzzz' });
      expect(res.statusCode).toBe(404);
      expect(String(res.body)).toContain('Suggestion not found');
      res = await decide(redis, { decision: 'maybe' });
      expect(res.body).toEqual({ error: 'unknown decision' });
      res = makeRes();
      await handleSuggestions(
        deps({ redis }),
        { method: 'GET', query: { action: 'explode', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
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
      await handleSuggestions(
        deps({ redis }),
        { method: 'GET', query: { action: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
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
    const without = (o: Record<string, unknown>, key: string) =>
      Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));

    it('skips hashes missing an id, game or name, or with an empty game, instead of crashing', async () => {
      const redis = makeRedis(
        {
          'suggestions:sug-1': without(approved, 'id'),
          'suggestions:sug-2': without(approved, 'game'),
          'suggestions:sug-3': without(approved, 'name'),
          'suggestions:sug-4': { ...approved, id: 'sug-4', game: '' },
          'suggestions:sug-5': { ...approved, id: 'sug-5', game: 'Kept' },
        },
        { 'suggestions:approved': ['sug-1', 'sug-2', 'sug-3', 'sug-4', 'sug-5', 'sug-missing'] },
      );
      expect((await list(redis)).map((i) => i.game)).toEqual(['Kept']);
    });

    it('excludes listed ids whose hash is not approved, including unknown statuses', async () => {
      const redis = makeRedis(
        {
          'suggestions:sug-1': { ...approved, id: 'sug-1', status: 'denied' },
          'suggestions:sug-2': { ...approved, id: 'sug-2', status: 'weird' },
          'suggestions:sug-3': { ...approved, id: 'sug-3', status: 'pending' },
          'suggestions:sug-4': { ...approved, id: 'sug-4' },
        },
        { 'suggestions:approved': ['sug-1', 'sug-2', 'sug-3', 'sug-4'] },
      );
      expect((await list(redis)).map((i) => i.id)).toEqual(['sug-4']);
    });

    it('orders by decidedAt descending whatever the list order', async () => {
      const redis = makeRedis(
        {
          'suggestions:sug-1': { ...approved, id: 'sug-1', decidedAt: 1 },
          'suggestions:sug-2': { ...approved, id: 'sug-2', decidedAt: 2 },
          'suggestions:sug-3': { ...approved, id: 'sug-3', decidedAt: 3 },
        },
        { 'suggestions:approved': ['sug-1', 'sug-2', 'sug-3'] },
      );
      expect((await list(redis)).map((i) => i.id)).toEqual(['sug-3', 'sug-2', 'sug-1']);
    });

    it('keeps numeric timestamps, falls back to 0 for a garbled createdAt and leaves decidedAt unset when absent', async () => {
      const redis = makeRedis(
        {
          'suggestions:sug-1': { ...approved, id: 'sug-1', createdAt: 1234 },
          'suggestions:sug-2': { ...without(approved, 'decidedAt'), id: 'sug-2', createdAt: 'yesterday' },
        },
        { 'suggestions:approved': ['sug-1', 'sug-2'] },
      );
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
        const redis = makeRedis(
          { 'suggestions:sug-1': { ...approved, id: 'sug-1', details } },
          { 'suggestions:approved': ['sug-1'] },
        );
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

      it('drops a stored img that is not an https link', async () => {
        const redis = makeRedis(
          {
            'suggestions:sug-ok': {
              ...pending,
              id: 'sug-ok',
              status: 'approved',
              details: JSON.stringify({ min: 2, max: 4, mins: 90, desc: '', kw: [], img: 'javascript:alert(1)' }),
            },
          },
          { 'suggestions:approved': ['sug-ok'] },
        );
        const res = makeRes();
        await handleSuggestions(deps({ redis }), { method: 'GET', query: {} }, res);
        expect((res.body as { items: Array<{ details?: { img?: string } }> }).items[0].details?.img).toBeUndefined();
      });

      it('falls back field by field on the wrong types: min 1, max 99, mins 0, desc empty, only string keywords', async () => {
        const raw =
          '{"bggId":"1","year":"2000","min":"2","max":1e999,"mins":null,"desc":5,"kw":["party",1,null,"family"]}';
        expect(await withDetails(raw)).toEqual({
          bggId: undefined,
          year: undefined,
          min: 1,
          max: 99,
          mins: 0,
          desc: '',
          kw: ['party', 'family'],
        });
        expect(await withDetails({})).toEqual({
          bggId: undefined,
          year: undefined,
          min: 1,
          max: 99,
          mins: 0,
          desc: '',
          kw: [],
        });
      });
    });
  });

  describe('owner actions (session instead of emailed token)', () => {
    const JSON_H = { 'content-type': 'application/json' };
    const asOwner = (over: Partial<SuggestionsDeps> = {}) => deps({ admin: async () => true, ...over });
    const approvedItem = {
      ...pending,
      id: 'sug-ok',
      game: 'Root',
      status: 'approved',
      decidedAt: 2000,
      details: JSON.stringify({ min: 2, max: 4, mins: 90, desc: 'Woodland war.', kw: ['strategy'] }),
    };

    describe('GET ?action=pending', () => {
      it('is refused without a session', async () => {
        const res = makeRes();
        await handleSuggestions(deps(), { method: 'GET', query: { action: 'pending' } }, res);
        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({ error: 'owner sign-in required' });
        const noAdmin = makeRes();
        await handleSuggestions(
          deps({ admin: async () => false }),
          { method: 'GET', query: { action: 'pending' } },
          noAdmin,
        );
        expect(noAdmin.statusCode).toBe(403);
      });

      it('lists what still needs a decision, newest first, without tokens, including unsent ones', async () => {
        const redis = makeRedis(
          {
            'suggestions:sug-old': { ...pending, id: 'sug-old', createdAt: 100 },
            'suggestions:sug-new': { ...pending, id: 'sug-new', createdAt: 300 },
            'suggestions:sug-unsent': { ...pending, id: 'sug-unsent', createdAt: 200, status: 'unsent' },
            'suggestions:sug-ok': approvedItem,
          },
          { 'suggestions:active': ['sug-old', 'sug-ok', 'sug-new'], 'suggestions:unsent': ['sug-unsent', 'sug-old'] },
        );
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
        const redis = makeRedis(
          { 'suggestions:sug-unsent': { ...pending, id: 'sug-unsent', status: 'unsent' } },
          { 'suggestions:unsent': ['sug-unsent', 'sug-other'] },
        );
        const res = makeRes();
        await handleSuggestions(
          asOwner({ redis }),
          { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-unsent' }, headers: JSON_H },
          res,
        );
        expect(res.statusCode).toBe(200);
        expect(redis.lists['suggestions:unsent']).toEqual(['sug-other']);
        expect(redis.lists['suggestions:active']).toEqual(['sug-unsent']);
        expect(redis.lists['suggestions:approved']).toEqual(['sug-unsent']);
      });
    });

    describe('POST decision from the site', () => {
      const decideReq = (body: unknown, headers: Record<string, string> = JSON_H) => ({
        method: 'POST',
        query: {},
        body,
        headers,
      });

      it('needs a JSON body as well as a session', async () => {
        const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
        const form = makeRes();
        await handleSuggestions(
          asOwner({ redis }),
          decideReq({ decision: 'approve', id: 'sug-aaaaaa' }, { 'content-type': 'application/x-www-form-urlencoded' }),
          form,
        );
        expect(form.statusCode).toBe(403);
        expect(form.body).toEqual({ error: 'owner actions must be sent as JSON' });
        const anon = makeRes();
        await handleSuggestions(deps({ redis }), decideReq({ decision: 'approve', id: 'sug-aaaaaa' }), anon);
        expect(anon.statusCode).toBe(403);
        expect(redis.hashes['suggestions:sug-aaaaaa'].status).toBe('pending');
      });

      it('approves with enrichment, box art included, and answers JSON, not a page', async () => {
        const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
        const lookup = vi.fn(async () =>
          found({
            bggId: 1,
            name: 'Wingspan',
            year: 2019,
            min: 1,
            max: 5,
            mins: 70,
            desc: 'Birds.',
            kw: ['strategy'],
            img: 'https://cf.geekdo-images.com/w.jpg',
          }),
        );
        const res = makeRes();
        await handleSuggestions(asOwner({ redis, lookup }), decideReq({ decision: 'approve', id: 'sug-aaaaaa' }), res);
        expect(res.statusCode).toBe(200);
        expect(res.headers['Content-Type']).toBeUndefined();
        expect(res.body).toMatchObject({
          item: {
            id: 'sug-aaaaaa',
            status: 'approved',
            decidedAt: 5000,
            details: { min: 1, max: 5, mins: 70, desc: 'Birds.', img: 'https://cf.geekdo-images.com/w.jpg' },
          },
        });
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
        await handleSuggestions(
          d,
          {
            method: 'POST',
            query: {},
            body: { action: 'add', game: 'Cascadia', name: 'Jess', ...body },
            headers: JSON_H,
          },
          res,
        );
        return res;
      };

      it('is refused without a session and sends no email', async () => {
        const d = deps();
        const res = await add({}, d);
        expect(res.statusCode).toBe(403);
        expect(d.sent).toHaveLength(0);
      });

      it('stores it approved, credited to the owner, listed and enriched, with the chosen section', async () => {
        const lookup = vi.fn(async () =>
          found({
            bggId: 7,
            name: 'Cascadia',
            year: 2021,
            min: 1,
            max: 4,
            mins: 45,
            desc: 'Tile laying.',
            kw: ['family'],
          }),
        );
        const d = asOwner({ lookup });
        const res = await add({ type: 'strategy', note: 'Calm' }, d);
        expect(res.statusCode).toBe(201);
        expect(res.body).toMatchObject({
          item: {
            id: 'sug-bbbbbb',
            game: 'Cascadia',
            name: 'Jess',
            note: 'Calm',
            status: 'approved',
            source: 'owner',
            createdAt: 5000,
            decidedAt: 5000,
            details: { min: 1, max: 4, mins: 45, desc: 'Tile laying.', kw: ['family'], type: 'strategy' },
          },
        });
        const redis = d.redis as ReturnType<typeof makeRedis>;
        expect(redis.lists['suggestions:approved']).toEqual(['sug-bbbbbb']);
        expect(redis.lists['suggestions:active']).toEqual(['sug-bbbbbb']);
        expect(d.sent).toHaveLength(0);
      });

      it('keeps the chosen section even when BoardGameGeek has nothing, and no details otherwise', async () => {
        const typed = await add({ type: 'party' }, asOwner({ lookup: async () => NO_MATCH }));
        expect(typed.body).toMatchObject({
          item: { details: { min: 1, max: 99, mins: 0, desc: '', kw: [], type: 'party' } },
        });
        const untyped = await add({}, asOwner({ lookup: async () => NO_MATCH }));
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
        await handleSuggestions(
          d,
          { method: 'POST', query: {}, body: { action: 'x', game: 'Cascadia', name: 'Sam' } },
          res,
        );
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'unknown action' });
        expect(d.sent).toHaveLength(0);
      });
    });

    describe('PATCH (editing how a game reads)', () => {
      const patch = async (
        body: Record<string, unknown>,
        d = asOwner({
          redis: makeRedis({ 'suggestions:sug-ok': approvedItem }, { 'suggestions:approved': ['sug-ok'] }),
        }),
      ) => {
        const res = makeRes();
        await handleSuggestions(
          d,
          { method: 'PATCH', query: {}, body: { id: 'sug-ok', ...body }, headers: JSON_H },
          res,
        );
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

      it('keeps the stored box art and ignores any img in the edit', async () => {
        const redis = makeRedis({
          'suggestions:sug-ok': {
            ...approvedItem,
            details: JSON.stringify({
              min: 2,
              max: 4,
              mins: 90,
              desc: '',
              kw: [],
              img: 'https://cf.geekdo-images.com/r.jpg',
            }),
          },
        });
        const res = makeRes();
        await handleSuggestions(
          asOwner({ redis }),
          {
            method: 'PATCH',
            query: {},
            body: { id: 'sug-ok', details: { mins: 60, img: 'https://evil.example/x.jpg' } },
            headers: JSON_H,
          },
          res,
        );
        expect(res.body).toMatchObject({ item: { details: { mins: 60, img: 'https://cf.geekdo-images.com/r.jpg' } } });
      });

      it('merges the given details over the stored ones and renames', async () => {
        const { res, redis } = await patch({
          game: '  Root:  A Game  ',
          note: 'Mean',
          details: { mins: 60, kw: ['strategy', 'thematic', 'strategy'], type: 'heavy' },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({
          item: {
            game: 'Root: A Game',
            note: 'Mean',
            details: { min: 2, max: 4, mins: 60, desc: 'Woodland war.', kw: ['strategy', 'thematic'], type: 'heavy' },
          },
        });
        expect(JSON.parse(String(redis.hashes['suggestions:sug-ok'].details))).toMatchObject({
          mins: 60,
          type: 'heavy',
        });
      });

      it("clears the section with null and folds the textarea's line breaks into the description", async () => {
        const { res } = await patch({ details: { type: null, desc: '  Two \n\n lines. ' } });
        const details = (res.body as { item: { details: Record<string, unknown> } }).item.details;
        expect(details.type).toBeUndefined();
        expect(details.desc).toBe('Two lines.');
      });

      it('rejects out-of-range or malformed edits with the reason', async () => {
        expect((await patch({ details: { min: 5, max: 2 } })).res.body).toEqual({
          error: 'players must be whole numbers from 1 to 99, min at most max',
        });
        expect((await patch({ details: { mins: 601 } })).res.body).toEqual({
          error: 'minutes must be a whole number from 0 to 600',
        });
        expect((await patch({ details: { min: 1.5 } })).res.statusCode).toBe(400);
        expect((await patch({ details: { desc: 'x'.repeat(DESC_MAX + 1) } })).res.statusCode).toBe(400);
        expect((await patch({ details: { kw: ['Not Valid'] } })).res.body).toEqual({
          error: 'keywords must be a short list of keyword ids',
        });
        expect((await patch({ details: { kw: ['not-a-real-keyword'] } })).res.statusCode).toBe(400);
        expect((await patch({ details: { kw: [42] } })).res.statusCode).toBe(400);
        expect((await patch({ details: { type: 'suggested' } })).res.body).toEqual({ error: 'unknown wishlist type' });
        expect((await patch({ details: 'nope' })).res.body).toEqual({ error: 'details must be an object' });
        expect((await patch({ details: [{ mins: 60 }] })).res.body).toEqual({ error: 'details must be an object' });
        expect((await patch({ game: 'X' })).res.statusCode).toBe(400);
        expect((await patch({ note: 42 })).res.statusCode).toBe(400);
        expect((await patch({})).res.body).toEqual({ error: 'nothing to change' });
      });

      it('starts from defaults when a game has no details yet', async () => {
        const redis = makeRedis({ 'suggestions:sug-bare': { ...pending, id: 'sug-bare', status: 'approved' } });
        const res = makeRes();
        await handleSuggestions(
          asOwner({ redis }),
          { method: 'PATCH', query: {}, body: { id: 'sug-bare', details: { mins: 30 } }, headers: JSON_H },
          res,
        );
        expect(res.body).toMatchObject({ item: { details: { min: 1, max: 99, mins: 30, desc: '', kw: [] } } });
      });

      it('will not edit a removed or denied game, or one that does not exist', async () => {
        const redis = makeRedis({ 'suggestions:sug-gone': { ...pending, id: 'sug-gone', status: 'removed' } });
        const res = makeRes();
        await handleSuggestions(
          asOwner({ redis }),
          { method: 'PATCH', query: {}, body: { id: 'sug-gone', game: 'Root' }, headers: JSON_H },
          res,
        );
        expect(res.statusCode).toBe(409);
        const missing = makeRes();
        await handleSuggestions(
          asOwner({ redis }),
          { method: 'PATCH', query: {}, body: { id: 'sug-nope', game: 'Root' }, headers: JSON_H },
          missing,
        );
        expect(missing.statusCode).toBe(404);
      });
    });

    describe('DELETE (taking a game off)', () => {
      it('drops it from both lists and marks it removed, keeping the hash', async () => {
        const redis = makeRedis(
          { 'suggestions:sug-ok': approvedItem },
          { 'suggestions:approved': ['sug-ok', 'sug-other'], 'suggestions:active': ['sug-ok'] },
        );
        const res = makeRes();
        await handleSuggestions(
          asOwner({ redis }),
          { method: 'DELETE', query: {}, body: { id: 'sug-ok' }, headers: JSON_H },
          res,
        );
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ ok: true });
        expect(redis.lists['suggestions:approved']).toEqual(['sug-other']);
        expect(redis.lists['suggestions:active']).toEqual([]);
        expect(redis.hashes['suggestions:sug-ok']).toMatchObject({ status: 'removed', decidedAt: 5000, game: 'Root' });
        // A later public read no longer shows it.
        const list = makeRes();
        await handleSuggestions(asOwner({ redis }), { method: 'GET', query: {} }, list);
        expect((list.body as { items: unknown[] }).items).toEqual([]);
      });

      it('400s on an id that names one of the id lists, without reading it as a suggestion', async () => {
        const redis = makeRedis();
        const res = makeRes();
        await handleSuggestions(
          asOwner({ redis }),
          { method: 'DELETE', query: {}, body: { id: 'approved' }, headers: JSON_H },
          res,
        );
        expect(res.statusCode).toBe(400);
        expect(redis.hgetall).not.toHaveBeenCalled();
      });

      it('only removes what is on the wishlist: a pending or already-removed record answers 409 untouched', async () => {
        for (const status of ['pending', 'unsent', 'denied', 'removed']) {
          const redis = makeRedis(
            { 'suggestions:sug-x': { ...pending, id: 'sug-x', status } },
            { 'suggestions:active': ['sug-x'], 'suggestions:unsent': ['sug-x'] },
          );
          const res = makeRes();
          await handleSuggestions(
            asOwner({ redis }),
            { method: 'DELETE', query: {}, body: { id: 'sug-x' }, headers: JSON_H },
            res,
          );
          expect(res.statusCode).toBe(409);
          expect(res.body).toEqual({ error: 'Wingspan is not on the wishlist' });
          expect(redis.hashes['suggestions:sug-x'].status).toBe(status);
          expect(redis.lists['suggestions:active']).toEqual(['sug-x']);
          expect(redis.lists['suggestions:unsent']).toEqual(['sug-x']);
        }
      });

      it('is refused without a session and reports an unknown id', async () => {
        const anon = makeRes();
        await handleSuggestions(deps(), { method: 'DELETE', query: {}, body: { id: 'sug-ok' }, headers: JSON_H }, anon);
        expect(anon.statusCode).toBe(403);
        const missing = makeRes();
        await handleSuggestions(
          asOwner(),
          { method: 'DELETE', query: {}, body: { id: 'sug-nope' }, headers: JSON_H },
          missing,
        );
        expect(missing.statusCode).toBe(404);
      });
    });

    it('knows the same keyword ids and wishlist sections as the client', () => {
      expect([...KEYWORD_IDS].sort()).toEqual(Object.keys(KW).sort());
      expect(KEYWORD_LABELS).toEqual(KW);
      expect([...WISHLIST_SECTION_IDS].sort()).toEqual([...WISHLIST_SECTIONS].sort());
    });

    it("puts the same bounds on an entry as the client's forms", () => {
      const { NAME_MAX, ...bounds } = clientLimits;
      expect(bounds).toEqual({ GAME_MIN, GAME_MAX, NOTE_MAX, DESC_MAX, PLAYERS_MAX, MINS_MAX });
      // The name's bound lives in NAME_RE: the longest name it takes is the form's.
      expect(NAME_RE.test('x'.repeat(NAME_MAX))).toBe(true);
      expect(NAME_RE.test('x'.repeat(NAME_MAX + 1))).toBe(false);
    });

    it('recognises a removed status and a stored section when parsing', async () => {
      const redis = makeRedis(
        {
          'suggestions:sug-gone': { ...approvedItem, id: 'sug-gone', status: 'removed' },
          'suggestions:sug-typed': {
            ...approvedItem,
            id: 'sug-typed',
            source: 'owner',
            details: JSON.stringify({ min: 2, max: 4, mins: 30, desc: '', kw: [], type: 'party' }),
          },
        },
        { 'suggestions:approved': ['sug-gone', 'sug-typed'] },
      );
      const res = makeRes();
      await handleSuggestions(deps({ redis }), { method: 'GET', query: {} }, res);
      const items = (res.body as { items: Array<Record<string, unknown>> }).items;
      expect(items.map((i) => i.id)).toEqual(['sug-typed']);
      expect(items[0]).toMatchObject({ source: 'owner', details: { type: 'party' } });
    });
  });

  describe('BoardGameGeek token problems', () => {
    const JSON_H = { 'content-type': 'application/json' };
    const addReq = {
      method: 'POST',
      query: {},
      body: { action: 'add', game: 'Magical Athlete', name: 'Jess' },
      headers: JSON_H,
    };
    const reported = () =>
      vi.mocked(reportError).mock.calls.map(([label, err]) => ({ label, message: (err as Error).message }));

    it('reports a missing token to Sentry by name, and still adds the game', async () => {
      vi.mocked(reportError).mockClear();
      const res = makeRes();
      await handleSuggestions(
        deps({ admin: async () => true, lookup: async () => ({ outcome: 'no-token' }) }),
        addReq,
        res,
      );
      expect(res.statusCode).toBe(201);
      expect(reported()).toEqual([
        {
          label: 'suggestions: BoardGameGeek lookup skipped',
          message: expect.stringContaining('BGG_API_TOKEN is not set') as unknown,
        },
      ]);
    });

    it.each([401, 403])('reports a token BGG refused with %i, and still approves', async (status) => {
      vi.mocked(reportError).mockClear();
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
      const res = makeRes();
      await handleSuggestions(
        deps({ redis, lookup: async () => ({ outcome: 'refused', status }) }),
        { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
      expect(String(res.body)).toContain('is now on the wishlist');
      expect(reported()).toEqual([
        {
          label: 'suggestions: BoardGameGeek lookup refused',
          message: expect.stringContaining(`BoardGameGeek refused BGG_API_TOKEN (HTTP ${status})`) as unknown,
        },
      ]);
    });

    it('does not report a plain miss or an outage as a token problem', async () => {
      vi.mocked(reportError).mockClear();
      for (const result of [NO_MATCH, { outcome: 'unavailable' } as const]) {
        await handleSuggestions(deps({ admin: async () => true, lookup: async () => result }), addReq, makeRes());
      }
      expect(reportError).not.toHaveBeenCalled();
    });
  });

  describe('telling the owner how the lookup went', () => {
    const JSON_H = { 'content-type': 'application/json' };
    const WINGSPAN = {
      bggId: 266192,
      name: 'Wingspan',
      year: 2019,
      min: 1,
      max: 5,
      mins: 70,
      desc: 'Birds.',
      kw: ['strategy'],
    };
    const approveBySite = async (lookup: SuggestionsDeps['lookup'], decision = 'approve') => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
      const res = makeRes();
      await handleSuggestions(
        deps({ redis, lookup, admin: async () => true }),
        { method: 'POST', query: {}, body: { decision, id: 'sug-aaaaaa' }, headers: JSON_H },
        res,
      );
      return res.body as { item: unknown; lookup?: string };
    };
    const approveByEmail = async (lookup: SuggestionsDeps['lookup']) => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });
      const res = makeRes();
      await handleSuggestions(
        deps({ redis, lookup }),
        { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
        res,
      );
      return String(res.body);
    };

    it('answers an add with the outcome beside the item', async () => {
      for (const [result, outcome] of [
        [found(WINGSPAN), 'found'],
        [NO_MATCH, 'no-match'],
        [{ outcome: 'unavailable' }, 'unavailable'],
      ] as const) {
        const res = makeRes();
        await handleSuggestions(
          deps({ admin: async () => true, lookup: async () => result }),
          { method: 'POST', query: {}, body: { action: 'add', game: 'Wingspan', name: 'Jess' }, headers: JSON_H },
          res,
        );
        expect(res.statusCode).toBe(201);
        expect(res.body).toMatchObject({ item: { game: 'Wingspan' }, lookup: outcome });
      }
    });

    it('leaves the outcome out when no lookup ran', async () => {
      const res = makeRes();
      await handleSuggestions(
        deps({ admin: async () => true, lookup: null }),
        { method: 'POST', query: {}, body: { action: 'add', game: 'Wingspan', name: 'Jess' }, headers: JSON_H },
        res,
      );
      expect(JSON.parse(JSON.stringify(res.body))).not.toHaveProperty('lookup');
    });

    it('answers an on-site approval with the outcome, and a denial without one', async () => {
      expect(await approveBySite(async () => ({ outcome: 'refused', status: 401 }))).toMatchObject({
        item: { status: 'approved' },
        lookup: 'refused',
      });
      expect(await approveBySite(async () => found(WINGSPAN))).toMatchObject({ lookup: 'found' });
      const denied = await approveBySite(async () => found(WINGSPAN), 'deny');
      expect(denied).toMatchObject({ item: { status: 'denied' } });
      expect(denied).not.toHaveProperty('lookup');
    });

    it("says on the emailed approval's page what the lookup could not fill in", async () => {
      expect(await approveByEmail(async () => NO_MATCH)).toContain('BoardGameGeek had no match for it');
      expect(await approveByEmail(async () => ({ outcome: 'no-token' }))).toContain("BGG_API_TOKEN isn't set");
      expect(await approveByEmail(async () => ({ outcome: 'refused', status: 403 }))).toContain(
        'BoardGameGeek refused the request (check BGG_API_TOKEN)',
      );
      expect(await approveByEmail(async () => ({ outcome: 'unavailable' }))).toContain("BoardGameGeek didn't answer");
      const quiet = await approveByEmail(async () => found(WINGSPAN));
      expect(quiet).toContain('is now on the wishlist, credited to Alex.</p>');
      expect(quiet).not.toContain('BoardGameGeek');
    });
  });

  describe('POST action=preview (looking a game up before adding it)', () => {
    const JSON_H = { 'content-type': 'application/json' };
    const WINGSPAN = {
      bggId: 266192,
      name: 'Wingspan',
      year: 2019,
      min: 1,
      max: 5,
      mins: 70,
      desc: 'Birds.',
      kw: ['strategy'],
      img: 'https://cf.geekdo-images.com/w.jpg',
    };
    const preview = async (
      lookup: SuggestionsDeps['lookup'],
      body: Record<string, unknown> = { action: 'preview', game: 'Wingspan' },
      over: Partial<SuggestionsDeps> = {},
    ) => {
      const d = deps({ admin: async () => true, lookup, ...over });
      const res = makeRes();
      await handleSuggestions(d, { method: 'POST', query: {}, body, headers: JSON_H }, res);
      return { res, redis: d.redis as ReturnType<typeof makeRedis> };
    };

    it('answers what BoardGameGeek found, and stores nothing', async () => {
      const lookup = vi.fn(async () => found(WINGSPAN));
      const { res, redis } = await preview(lookup, { action: 'preview', game: '  Wingspan ' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ outcome: 'found', details: WINGSPAN });
      expect(lookup).toHaveBeenCalledWith('Wingspan');
      expect(redis.hashes).toEqual({});
      expect(redis.lists).toEqual({});
    });

    it('answers why it found nothing, with no details and never the cause', async () => {
      expect((await preview(async () => NO_MATCH)).res.body).toEqual({ outcome: 'no-match' });
      expect((await preview(async () => ({ outcome: 'refused', status: 401 }))).res.body).toEqual({
        outcome: 'refused',
      });
      expect(
        (await preview(async () => ({ outcome: 'unavailable', cause: new Error('socket hang up') }))).res.body,
      ).toEqual({ outcome: 'unavailable' });
      expect(
        (
          await preview(async () => {
            throw new Error('bgg down');
          })
        ).res.body,
      ).toEqual({ outcome: 'unavailable' });
      expect((await preview(null)).res.body).toEqual({ outcome: 'unavailable' });
    });

    it('reports a missing token to Sentry here too', async () => {
      vi.mocked(reportError).mockClear();
      expect((await preview(async () => ({ outcome: 'no-token' }))).res.body).toEqual({ outcome: 'no-token' });
      expect(vi.mocked(reportError).mock.calls.map(([, err]) => (err as Error).message)).toEqual([
        expect.stringContaining('BGG_API_TOKEN'),
      ]);
    });

    it('is owner-only, JSON-only, and validates the name before looking anything up', async () => {
      const lookup = vi.fn(async () => found(WINGSPAN));
      expect((await preview(lookup, undefined, { admin: async () => false })).res.statusCode).toBe(403);
      const form = makeRes();
      await handleSuggestions(
        deps({ admin: async () => true, lookup }),
        {
          method: 'POST',
          query: {},
          body: { action: 'preview', game: 'Wingspan' },
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        },
        form,
      );
      expect(form.statusCode).toBe(403);
      const bad = await preview(lookup, { action: 'preview', game: 'X' });
      expect(bad.res.statusCode).toBe(400);
      expect(bad.res.body).toEqual({ error: 'game must be 2–80 characters' });
      expect(lookup).not.toHaveBeenCalled();
    });
  });

  describe('POST action=add with previewed details', () => {
    const JSON_H = { 'content-type': 'application/json' };
    const PREVIEWED = {
      bggId: 266192,
      year: 2019,
      min: 1,
      max: 5,
      mins: 70,
      desc: 'Birds.',
      kw: ['strategy'],
      img: 'https://cf.geekdo-images.com/w.jpg',
    };
    const add = async (body: Record<string, unknown>) => {
      const lookup = vi.fn(async () => NO_MATCH);
      const d = deps({ admin: async () => true, lookup });
      const res = makeRes();
      await handleSuggestions(
        d,
        {
          method: 'POST',
          query: {},
          body: { action: 'add', game: 'Wingspan', name: 'Jess', ...body },
          headers: JSON_H,
        },
        res,
      );
      const redis = d.redis as ReturnType<typeof makeRedis>;
      const raw = redis.hashes['suggestions:sug-bbbbbb']?.details;
      return {
        res,
        lookup,
        redis,
        stored: raw === undefined ? undefined : (JSON.parse(String(raw)) as Record<string, unknown>),
      };
    };

    it('stores them with the section, without looking the game up again', async () => {
      const { res, lookup, stored, redis } = await add({ details: { ...PREVIEWED, type: 'party' }, type: 'strategy' });
      expect(res.statusCode).toBe(201);
      expect(lookup).not.toHaveBeenCalled();
      expect(stored).toEqual({ ...PREVIEWED, type: 'strategy' });
      expect(res.body).toMatchObject({ item: { status: 'approved', details: { ...PREVIEWED, type: 'strategy' } } });
      expect(res.body).not.toHaveProperty('lookup', expect.anything());
      expect(redis.lists['suggestions:approved']).toEqual(['sug-bbbbbb']);
    });

    it('takes a section only from the add, never from the details', async () => {
      expect((await add({ details: { ...PREVIEWED, type: 'party' } })).stored).toEqual(PREVIEWED);
    });

    it('drops a section it does not know from the details instead of refusing the add', async () => {
      const { res, stored } = await add({ details: { ...PREVIEWED, type: 'no-such-section' }, type: 'party' });
      expect(res.statusCode).toBe(201);
      expect(stored).toEqual({ ...PREVIEWED, type: 'party' });
    });

    it('adds what a preview answered for a BGG entry past the bounds (999 players, 720 minutes, a soft hyphen)', async () => {
      const crowd = parseThing(
        '<items><item type="boardgame" id="7"><name type="primary" value="Crowd"/><description>Every&#173;one plays.</description><minplayers value="3"/><maxplayers value="999"/><playingtime value="720"/></item></items>',
      )!;
      const previewed = makeRes();
      await handleSuggestions(
        deps({ admin: async () => true, lookup: async () => found(crowd) }),
        { method: 'POST', query: {}, body: { action: 'preview', game: 'Crowd' }, headers: JSON_H },
        previewed,
      );
      // Sent back as the client sends it: through JSON, as the add's details.
      const { details } = JSON.parse(JSON.stringify(previewed.body)) as { details: Record<string, unknown> };
      const { res, stored } = await add({ details });
      expect(res.statusCode).toBe(201);
      expect(stored).toEqual({ bggId: 7, min: 3, max: PLAYERS_MAX, mins: MINS_MAX, desc: 'Everyone plays.', kw: [] });
    });

    it('adds without details when the owner chose to, keeping the section', async () => {
      const typed = await add({ details: null, type: 'party' });
      expect(typed.lookup).not.toHaveBeenCalled();
      expect(typed.stored).toEqual({ min: 1, max: 99, mins: 0, desc: '', kw: [], type: 'party' });
      const bare = await add({ details: null });
      expect(bare.lookup).not.toHaveBeenCalled();
      expect(bare.stored).toBeUndefined();
      expect(bare.res.statusCode).toBe(201);
    });

    it("holds previewed details to an edit's rules and stores nothing when they fail", async () => {
      for (const [details, error] of [
        ['nope', 'details must be an object'],
        [{ ...PREVIEWED, min: 5, max: 2 }, 'players must be whole numbers from 1 to 99, min at most max'],
        [{ ...PREVIEWED, kw: ['not-a-real-keyword'] }, 'keywords must be a short list of keyword ids'],
        [{ ...PREVIEWED, desc: 'x'.repeat(DESC_MAX + 1) }, `description must be at most ${DESC_MAX} characters`],
        [{ ...PREVIEWED, bggId: 0 }, 'bggId must be a positive whole number'],
        [{ ...PREVIEWED, bggId: '266192' }, 'bggId must be a positive whole number'],
        [{ ...PREVIEWED, year: 2019.5 }, 'year must be a whole number'],
        [{ ...PREVIEWED, year: 10_000 }, 'year must be a whole number'],
        [{ ...PREVIEWED, img: 'http://insecure.example/x.jpg' }, 'img must be a BoardGameGeek image URL'],
        [
          { ...PREVIEWED, img: `https://cf.geekdo-images.com/${'x'.repeat(500)}` },
          'img must be a BoardGameGeek image URL',
        ],
        [{ ...PREVIEWED, img: 42 }, 'img must be a BoardGameGeek image URL'],
        // Box art comes from BGG's image CDN only, never another https host.
        [{ ...PREVIEWED, img: 'https://evil.example/x.jpg' }, 'img must be a BoardGameGeek image URL'],
        [
          { ...PREVIEWED, img: 'https://cf.geekdo-images.com.evil.example/x.jpg' },
          'img must be a BoardGameGeek image URL',
        ],
        [[PREVIEWED], 'details must be an object'],
      ] as const) {
        const { res, redis } = await add({ details });
        expect(res.statusCode, JSON.stringify(details).slice(0, 80)).toBe(400);
        expect(res.body).toEqual({ error });
        expect(redis.hashes).toEqual({});
      }
    });

    it('accepts a game BGG dates before the common era, and details without the optional fields', async () => {
      expect((await add({ details: { ...PREVIEWED, year: -2200 } })).stored).toMatchObject({ year: -2200 });
      const { stored } = await add({ details: { min: 2, max: 2, mins: 20, desc: '', kw: [] } });
      expect(stored).toEqual({ min: 2, max: 2, mins: 20, desc: '', kw: [] });
    });
  });

  describe('approving with what the owner saw (a corrected name, previewed details)', () => {
    const JSON_H = { 'content-type': 'application/json' };
    const ARKHAM_FOUND = {
      bggId: 15987,
      name: 'Arkham Horror',
      year: 2005,
      min: 1,
      max: 8,
      mins: 240,
      desc: 'Investigate Arkham.',
      kw: ['cooperative', 'thematic'],
      img: 'https://cf.geekdo-images.com/ah.jpg',
    };
    const ARKHAM = {
      bggId: 15987,
      year: 2005,
      min: 1,
      max: 8,
      mins: 240,
      desc: 'Investigate Arkham.',
      kw: ['cooperative', 'thematic'],
      img: 'https://cf.geekdo-images.com/ah.jpg',
    };
    const misspelt = { ...pending, game: 'Arkham Horry', name: 'Robin', note: '' };
    const other = { ...pending, id: 'sug-cccccc', game: 'Arkham Horror', status: 'approved', decidedAt: 10 };

    function setup(seed: Record<string, unknown> = misspelt, extra: FakeRedisSeed['hashes'] = {}) {
      const ids = ['sug-aaaaaa', ...Object.keys(extra).map((k) => k.replace('suggestions:', ''))];
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': seed, ...extra }, { 'suggestions:active': ids });
      const lookup = vi.fn(async (name: string): Promise<LookupResult> =>
        name === 'Arkham Horror' ? found(ARKHAM_FOUND) : NO_MATCH,
      );
      return { redis, lookup };
    }
    const stored = (redis: ReturnType<typeof makeRedis>) => redis.hashes['suggestions:sug-aaaaaa'];
    /** The one HSET the approval made, its details read back from their JSON. */
    const oneWrite = (redis: ReturnType<typeof makeRedis>) => {
      expect(redis.hset).toHaveBeenCalledTimes(1);
      const [key, fields] = redis.hset.mock.calls[0];
      expect(key).toBe('suggestions:sug-aaaaaa');
      return { ...fields, details: JSON.parse(String(fields.details)) as unknown };
    };
    const untouched = (redis: ReturnType<typeof makeRedis>) => {
      expect(stored(redis).status).toBe('pending');
      expect(stored(redis).decidedAt).toBeUndefined();
      expect(stored(redis).game).toBe('Arkham Horry');
      expect(redis.lists['suggestions:approved']).toBeUndefined();
    };

    describe('from the site', () => {
      const approve = async (body: Record<string, unknown>, ctx = setup()) => {
        const res = makeRes();
        await handleSuggestions(
          deps({ redis: ctx.redis, lookup: ctx.lookup, admin: async () => true }),
          { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', ...body }, headers: JSON_H },
          res,
        );
        return { res, ...ctx };
      };

      it('stores the previewed details and the corrected name with the status, without looking it up again', async () => {
        const { res, redis, lookup } = await approve({
          game: '  Arkham   Horror ',
          details: { ...ARKHAM, name: 'BGG name', type: 'party' },
        });
        expect(res.statusCode).toBe(200);
        expect(lookup).not.toHaveBeenCalled();
        // One write: the name, the details and the status land together.
        expect(oneWrite(redis)).toEqual({
          status: 'approved',
          decidedAt: 5000,
          game: 'Arkham Horror',
          details: ARKHAM,
        });
        expect(res.body).toEqual({
          item: expect.objectContaining({ game: 'Arkham Horror', status: 'approved', details: ARKHAM }) as unknown,
        });
        expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
      });

      it('approves with no details, and no lookup, when the preview found nothing', async () => {
        const { res, redis, lookup } = await approve({ details: null });
        expect(res.statusCode).toBe(200);
        expect(lookup).not.toHaveBeenCalled();
        expect(stored(redis)).toMatchObject({ status: 'approved', game: 'Arkham Horry' });
        expect(stored(redis).details).toBeUndefined();
        expect(JSON.parse(JSON.stringify(res.body))).not.toHaveProperty('lookup');
      });

      it('looks a corrected name up itself when no details came with it', async () => {
        const { res, redis, lookup } = await approve({ game: 'Arkham Horror' });
        expect(lookup).toHaveBeenCalledWith('Arkham Horror');
        expect(res.body).toMatchObject({ item: { game: 'Arkham Horror', details: ARKHAM }, lookup: 'found' });
        expect(stored(redis).game).toBe('Arkham Horror');
      });

      it("holds the details to an add's rules, and the name to an add's, storing nothing when they fail", async () => {
        for (const [body, error] of [
          [{ details: { ...ARKHAM, min: 5, max: 2 } }, 'players must be whole numbers from 1 to 99, min at most max'],
          [{ details: { ...ARKHAM, img: 'http://insecure.example/x.jpg' } }, 'img must be a BoardGameGeek image URL'],
          // JSON text is only how the emailed page's form sends them.
          [{ details: JSON.stringify(ARKHAM) }, 'details must be an object'],
          [{ details: [ARKHAM] }, 'details must be an object'],
          [{ game: 'X' }, 'game must be 2–80 characters'],
          [{ game: 42 }, 'game must be 2–80 characters'],
        ] as const) {
          const { res, redis, lookup } = await approve(body);
          expect(res.statusCode, JSON.stringify(body)).toBe(400);
          expect(res.body).toEqual({ error });
          untouched(redis);
          expect(lookup).not.toHaveBeenCalled();
        }
      });

      it('refuses a correction onto a game another entry already lists', async () => {
        const { res, redis } = await approve(
          { game: 'arkham horror', details: ARKHAM },
          setup(misspelt, { 'suggestions:sug-cccccc': other }),
        );
        expect(res.statusCode).toBe(409);
        expect(res.body).toEqual({ error: 'Arkham Horror is already on the list' });
        untouched(redis);
      });

      it('lets a name be corrected to another spelling of itself', async () => {
        const { res, redis } = await approve({ game: 'arkham horry', details: null });
        expect(res.statusCode).toBe(200);
        expect(stored(redis).game).toBe('arkham horry');
      });

      it('leaves a denial as it was, whatever else comes with it', async () => {
        const { res, redis, lookup } = await approve({ decision: 'deny', game: 'X', details: 'nope' });
        expect(res.statusCode).toBe(200);
        expect(stored(redis)).toMatchObject({ status: 'denied', game: 'Arkham Horry' });
        expect(lookup).not.toHaveBeenCalled();
      });
    });

    describe('from the emailed page', () => {
      // A form post arrives as text fields, the details as JSON text; a JSON
      // post to the same path is still read as before.
      const approve = async (body: Record<string, unknown>, ctx = setup()) => {
        const res = makeRes();
        await handleSuggestions(
          deps({ redis: ctx.redis, lookup: ctx.lookup }),
          { method: 'POST', query: {}, body: { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN, ...body } },
          res,
        );
        return { res, html: String(res.body), ...ctx };
      };

      it('stores the posted details and name, from form fields or JSON, without looking it up again', async () => {
        for (const details of [JSON.stringify(ARKHAM), ARKHAM]) {
          const { res, html, redis, lookup } = await approve({ game: 'Arkham Horror', details });
          expect(res.statusCode).toBe(200);
          expect(lookup).not.toHaveBeenCalled();
          expect(oneWrite(redis)).toEqual({
            status: 'approved',
            decidedAt: 5000,
            game: 'Arkham Horror',
            details: ARKHAM,
          });
          expect(html).toContain('Arkham Horror is now on the wishlist, credited to Robin.</p>');
        }
      });

      it('approves with no details when the page showed none, and says so', async () => {
        const { res, html, redis, lookup } = await approve({ game: 'Arkham Horry', details: 'null' });
        expect(res.statusCode).toBe(200);
        expect(lookup).not.toHaveBeenCalled();
        expect(stored(redis)).toMatchObject({ status: 'approved', game: 'Arkham Horry' });
        expect(stored(redis).details).toBeUndefined();
        expect(html).toContain(
          'Arkham Horry is now on the wishlist, credited to Robin. It has no details yet: sign in on the site to fill them in with Edit.',
        );
      });

      it('answers bad details or a bad name with a page and a 400, storing nothing', async () => {
        for (const body of [
          { details: '{oops' },
          { details: '"text"' },
          { details: JSON.stringify([ARKHAM]) },
          { details: JSON.stringify({ ...ARKHAM, kw: ['nope'] }) },
          { game: 'X' },
          { game: ['Arkham', 'Horror'] },
        ]) {
          const { res, html, redis } = await approve(body);
          expect(res.statusCode, JSON.stringify(body)).toBe(400);
          expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
          expect(html).toContain('<h1>Not approved</h1>');
          expect(html).toContain('Nothing changed');
          untouched(redis);
        }
      });

      it('refuses a correction onto a game already listed, with a page', async () => {
        const { res, html, redis } = await approve(
          { game: 'Arkham Horror', details: 'null' },
          setup(misspelt, { 'suggestions:sug-cccccc': other }),
        );
        expect(res.statusCode).toBe(409);
        expect(html).toContain('<h1>Already on the list</h1>');
        expect(html).toContain('Arkham Horror is already on the list. Nothing changed.');
        untouched(redis);
      });

      it('checks the token before anything else', async () => {
        const { res, redis } = await approve({ token: 'test-token-' + 'z'.repeat(21), details: '{oops' });
        expect(res.statusCode).toBe(403);
        untouched(redis);
      });
    });

    describe('the confirmation page', () => {
      const confirm = async (query: Record<string, unknown> = {}, ctx = setup()) => {
        const res = makeRes();
        await handleSuggestions(
          deps({ redis: ctx.redis, lookup: ctx.lookup }),
          {
            method: 'GET',
            query: { action: 'approve', id: 'sug-aaaaaa', token: TOKEN, ...query } as SuggestionsRequest['query'],
          },
          res,
        );
        return { res, html: String(res.body), ...ctx };
      };
      const noWrites = (redis: ReturnType<typeof makeRedis>) => {
        for (const write of [redis.hset, redis.hsetnx, redis.hdel, redis.lpush, redis.lrem, redis.multi])
          expect(write).not.toHaveBeenCalled();
      };
      const unescape = (s: string) =>
        s
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');
      const field = (html: string, name: string) => {
        const m = new RegExp(`<form method="post"[^]*?name="${name}" value="([^"]*)"`).exec(html);
        return m ? unescape(m[1]) : undefined;
      };

      it("looks the friend's spelling up and shows what it found, posting it with the approval, without writing anything", async () => {
        const ctx = setup({ ...misspelt, game: 'Arkham Horror' });
        const { res, html, redis, lookup } = await confirm({}, ctx);
        expect(res.statusCode).toBe(200);
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledWith('Arkham Horror');
        noWrites(redis);
        expect(html).toContain('<h1>Approve Arkham Horror?</h1>');
        expect(html).toContain('<img src="https://cf.geekdo-images.com/ah.jpg" alt="" width="64" height="64">');
        expect(html).toContain('<p class="name">Arkham Horror (2005)</p>');
        expect(html).toContain('<p>1–8 players · 240 min</p>');
        expect(html).toContain('<p class="desc">Investigate Arkham.</p>');
        expect(html).toContain('<ul class="kw" aria-label="Keywords"><li>Cooperative</li><li>Thematic</li></ul>');
        expect(field(html, 'game')).toBe('Arkham Horror');
        expect(JSON.parse(field(html, 'details')!)).toEqual(ARKHAM);
      });

      it('escapes everything the lookup and the friend wrote', async () => {
        const nasty = {
          ...ARKHAM_FOUND,
          name: '<script>x</script>',
          desc: 'Say "hi" & <b>run</b>',
          img: 'https://cf.geekdo-images.com/a"onerror="x.jpg',
          kw: ['not-a-keyword<i>'],
        };
        const ctx = setup({ ...misspelt, game: 'A&B <i>', name: 'Ro"bin', note: '<u>n</u>' });
        ctx.lookup.mockResolvedValue(found(nasty));
        const { html } = await confirm({}, ctx);
        for (const raw of ['<script>', '<b>run', 'a"onerror', '<i>', '<u>', 'Ro"bin']) expect(html).not.toContain(raw);
        expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
        expect(html).toContain('Say &quot;hi&quot; &amp; &lt;b&gt;run&lt;/b&gt;');
        expect(html).toContain('src="https://cf.geekdo-images.com/a&quot;onerror=&quot;x.jpg"');
        expect(html).toContain('<li>not-a-keyword&lt;i&gt;</li>');
        expect(html).toContain('value="A&amp;B &lt;i&gt;"');
        // What the approval posts back is the lookup's own, intact once the form decodes it.
        expect((JSON.parse(field(html, 'details')!) as { desc: string }).desc).toBe('Say "hi" & <b>run</b>');
      });

      it('says why it found nothing, and posts no details for it', async () => {
        for (const [result, text] of [
          [NO_MATCH, 'BoardGameGeek had no match for “Arkham Horry”.'],
          [{ outcome: 'no-token' }, "“Arkham Horry” couldn't be looked up: BGG_API_TOKEN isn't set."],
          [
            { outcome: 'refused', status: 401 },
            "“Arkham Horry” couldn't be looked up: BoardGameGeek refused the request (check BGG_API_TOKEN).",
          ],
        ] as const) {
          const ctx = setup();
          ctx.lookup.mockResolvedValue(result as LookupResult);
          const { html, redis } = await confirm({}, ctx);
          expect(html).toContain(`<p class="miss">${text} Approving adds it without details`);
          expect(html).not.toContain('class="preview"');
          expect(field(html, 'details')).toBe('null');
          noWrites(redis);
        }
      });

      it('leaves the details out after an outage, so the approval tries the lookup again', async () => {
        const ctx = setup();
        ctx.lookup.mockResolvedValue({ outcome: 'unavailable' });
        const { html } = await confirm({}, ctx);
        expect(html).toContain(
          '<p class="miss">BoardGameGeek didn\'t answer for “Arkham Horry”. Approving tries again',
        );
        expect(html).not.toContain('name="details"');
        expect(field(html, 'game')).toBe('Arkham Horry');
      });

      it("sends no referrer, so the box art request never carries the link's token", async () => {
        const { html } = await confirm({ game: 'Arkham Horror' });
        expect(html).toContain('<meta name="referrer" content="no-referrer">');
        expect(html).toContain('<img src="https://cf.geekdo-images.com/');
      });

      it('looks a corrected name up when the page is opened again with it, and still writes nothing', async () => {
        const { res, html, redis, lookup } = await confirm({ game: ' Arkham  Horror ' });
        expect(res.statusCode).toBe(200);
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledWith('Arkham Horror');
        noWrites(redis);
        expect(html).toContain('<h1>Approve Arkham Horror?</h1>');
        expect(html).toContain('Suggested by Robin as “Arkham Horry”');
        expect(html).toContain('<p class="desc">Investigate Arkham.</p>');
        expect(field(html, 'game')).toBe('Arkham Horror');
        expect(JSON.parse(field(html, 'details')!)).toEqual(ARKHAM);
      });

      it("corrects the name with a GET to this same page, keeping the link's id, token and action", async () => {
        const { html } = await confirm();
        const rename =
          /<form class="rename" method="get" action="\/api\/suggestions">(.*?)<\/form>/.exec(html)?.[1] ?? '';
        expect(rename).toContain('<input type="hidden" name="action" value="approve">');
        expect(rename).toContain('<input type="hidden" name="id" value="sug-aaaaaa">');
        expect(rename).toContain(`<input type="hidden" name="token" value="${TOKEN}">`);
        expect(rename).toContain(
          `<input id="game" name="game" value="Arkham Horry" required minlength="${GAME_MIN}" maxlength="${GAME_MAX}"`,
        );
        expect(rename).toContain('<label for="game">');
      });

      it('answers a bad name with a 400 page, looking nothing up', async () => {
        for (const game of ['X', ['Arkham', 'Horror'], 'x'.repeat(GAME_MAX + 1)]) {
          const { res, html, lookup, redis } = await confirm({ game });
          expect(res.statusCode, JSON.stringify(game)).toBe(400);
          expect(html).toContain('<h1>Name not recognised</h1>');
          expect(lookup).not.toHaveBeenCalled();
          noWrites(redis);
        }
      });

      it('checks the link before looking anything up, and never looks up for a denial or a decided suggestion', async () => {
        const bad = await confirm({ token: 'test-token-' + 'z'.repeat(21) });
        expect(bad.res.statusCode).toBe(403);
        expect(bad.lookup).not.toHaveBeenCalled();
        const deny = await confirm({ action: 'deny', game: 'Arkham Horror' });
        expect(deny.html).toContain('<h1>Deny Arkham Horry?</h1>');
        expect(deny.html).not.toContain('name="game"');
        expect(deny.lookup).not.toHaveBeenCalled();
        const decided = await confirm({}, setup({ ...misspelt, status: 'approved', decidedAt: 10 }));
        expect(decided.html).toContain('Already approved');
        expect(decided.lookup).not.toHaveBeenCalled();
      });

      it('posts no details when no lookup is configured, so the approval looks it up as before', async () => {
        const redis = makeRedis({ 'suggestions:sug-aaaaaa': misspelt });
        const res = makeRes();
        await handleSuggestions(
          deps({ redis, lookup: null }),
          { method: 'GET', query: { action: 'approve', id: 'sug-aaaaaa', token: TOKEN } },
          res,
        );
        const html = String(res.body);
        expect(html).not.toContain('name="details"');
        expect(html).not.toContain('class="preview"');
        expect(html).not.toContain('class="miss"');
        expect(field(html, 'game')).toBe('Arkham Horry');
      });

      it('approves exactly what it showed, once the form posts it back', async () => {
        const ctx = setup();
        const { html } = await confirm({ game: 'Arkham Horror' }, ctx);
        const res = makeRes();
        const body = {
          decision: field(html, 'decision'),
          id: field(html, 'id'),
          token: field(html, 'token'),
          game: field(html, 'game'),
          details: field(html, 'details'),
        };
        await handleSuggestions(
          deps({ redis: ctx.redis, lookup: ctx.lookup }),
          { method: 'POST', query: {}, body, headers: { 'content-type': 'application/x-www-form-urlencoded' } },
          res,
        );
        expect(res.statusCode).toBe(200);
        expect(ctx.lookup).toHaveBeenCalledTimes(1);
        const approved = makeRes();
        await handleSuggestions(deps({ redis: ctx.redis }), { method: 'GET', query: {} }, approved);
        expect((approved.body as { items: unknown[] }).items).toEqual([
          expect.objectContaining({ id: 'sug-aaaaaa', game: 'Arkham Horror', status: 'approved', details: ARKHAM }),
        ]);
      });
    });
  });
});
