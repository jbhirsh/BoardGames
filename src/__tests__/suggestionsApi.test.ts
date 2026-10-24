// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// The lookup's token reports go through reportError; spied here so a test
// can see them without a Sentry client.
vi.mock('../../api/_lib/sentry.js', async (importActual) => ({
  ...(await importActual<typeof import('../../api/_lib/sentry')>()),
  reportError: vi.fn(async () => {}),
}));
import {
  addGame,
  approvedList,
  decideSuggestion,
  editSuggestion,
  openEmailed,
  pendingList,
  previewEmailed,
  previewGame,
  removeSuggestion,
  suggestGame,
  KEYWORD_IDS,
  WISHLIST_SECTION_IDS,
  NAME_RE,
  GAME_MIN,
  GAME_MAX,
  NOTE_MAX,
  DESC_MAX,
  MINS_MAX,
  PLAYERS_MAX,
  type ApprovalInput,
  type SuggestionsDeps,
} from '../../api/_resolvers/suggestions';
import { ApiError } from '../../api/_resolvers/errors';
import { resendMailer, type Mail } from '../../api/_lib/mail';
import { reportError } from '../../api/_lib/sentry';
import { KW, WISHLIST_SECTIONS } from '../data/keywords';
import * as clientLimits from '../data/suggestionLimits';
import { fakeRedis, type FakeRedisSeed } from './helpers/fakeRedis';
import { parseThing, type GameDetails, type LookupResult } from '../../api/_lib/bgg';
import { abortReason } from './helpers/abortReason';

/** Suggestion hashes and id lists, as the raw client answers. */
const makeRedis = (hashes: FakeRedisSeed['hashes'] = {}, lists: FakeRedisSeed['lists'] = {}) =>
  fakeRedis({ hashes, lists, raw: true });
type Redis = ReturnType<typeof makeRedis>;

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

function deps(over: Partial<SuggestionsDeps> = {}): SuggestionsDeps & { sent: Mail[]; redis: Redis } {
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
  } as SuggestionsDeps & { sent: Mail[]; redis: Redis };
}

/** The refusal a call ends in; fails the test if it succeeds or throws something else. */
async function refusal(call: Promise<unknown>): Promise<ApiError> {
  try {
    await call;
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error('expected a refusal');
}

const found = (details: GameDetails): LookupResult => ({ outcome: 'found', details });
const NO_MATCH: LookupResult = { outcome: 'no-match' };

const valid = { game: 'Cascadia', name: 'Sam', note: 'Calm and quick' };
const BELL = String.fromCharCode(7);

/** A decision from the emailed link, approving unless told otherwise. */
const byLink = (
  d: SuggestionsDeps,
  extra: ApprovalInput & { id?: unknown; token?: unknown; decision?: 'approve' | 'deny' } = {},
) => decideSuggestion(d, { decision: 'approve', id: 'sug-aaaaaa', token: TOKEN, ...extra });
/** A decision from the site, whose session the resolver has checked. */
const bySite = (d: SuggestionsDeps, extra: ApprovalInput & { id?: unknown; decision?: 'approve' | 'deny' } = {}) =>
  decideSuggestion(d, { decision: 'approve', id: 'sug-aaaaaa', ...extra });

describe('approvedList', () => {
  it('reads only the approved list, newest decision first, without tokens', async () => {
    const redis = makeRedis(
      {
        'suggestions:sug-a': { ...pending, id: 'sug-a', status: 'approved', decidedAt: 10 },
        'suggestions:sug-b': { ...pending, id: 'sug-b', game: 'Azul', status: 'approved', decidedAt: 20 },
        'suggestions:sug-d': { ...pending, id: 'sug-d', game: 'Later' },
      },
      { 'suggestions:approved': ['sug-a', 'sug-b'], 'suggestions:active': ['sug-d', 'sug-b', 'sug-a'] },
    );
    const items = await approvedList(deps({ redis }));
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
    expect((await approvedList(deps({ redis })))[0]).toMatchObject({ game: '1830', name: '42', note: 'true' });
  });

  it.each(['null', 'true', '1.50', '007'])(
    'keeps a game called %s as written, through the duplicate check, its links and the list',
    async (game) => {
      const d = deps();
      await suggestGame(d, { game, name: 'Sam' });
      expect((await refusal(suggestGame(d, { game, name: 'Kim' }))).status).toBe(409);
      const approved = await decideSuggestion(d, { decision: 'approve', id: 'sug-bbbbbb', token: NEW_TOKEN });
      expect(approved.item).toMatchObject({ game, status: 'approved' });
      expect((await approvedList(d)).map((i) => i.game)).toEqual([game]);
    },
  );

  it('shows a game once even if its id is listed twice', async () => {
    const redis = makeRedis(
      { 'suggestions:sug-a': { ...pending, id: 'sug-a', status: 'approved', decidedAt: 10 } },
      { 'suggestions:approved': ['sug-a', 'sug-a'] },
    );
    expect((await approvedList(deps({ redis }))).map((i) => i.id)).toEqual(['sug-a']);
  });

  it('is empty when nothing has been approved', async () => {
    expect(await approvedList(deps())).toEqual([]);
  });

  it('never touches the base URL on reads, only when sending', async () => {
    const baseUrl = vi.fn(() => {
      throw new Error('APP_URL must be set');
    });
    expect(await approvedList(deps({ baseUrl }))).toEqual([]);
    expect(baseUrl).not.toHaveBeenCalled();
  });
});

describe('parsing stored hashes', () => {
  const approved = { ...pending, status: 'approved', decidedAt: 10 };
  const without = (o: Record<string, unknown>, key: string) =>
    Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));
  const list = (redis: Redis) => approvedList(deps({ redis }));

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

  it('recognises a removed status and a stored section', async () => {
    const redis = makeRedis(
      {
        'suggestions:sug-gone': { ...approved, id: 'sug-gone', status: 'removed' },
        'suggestions:sug-typed': {
          ...approved,
          id: 'sug-typed',
          source: 'owner',
          details: JSON.stringify({ min: 2, max: 4, mins: 30, desc: '', kw: [], type: 'party' }),
        },
      },
      { 'suggestions:approved': ['sug-gone', 'sug-typed'] },
    );
    const items = await list(redis);
    expect(items.map((i) => i.id)).toEqual(['sug-typed']);
    expect(items[0]).toMatchObject({ source: 'owner', details: { type: 'party' } });
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
      expect(
        (await withDetails(JSON.stringify({ min: 2, max: 4, mins: 90, desc: '', kw: [], img: 'javascript:alert(1)' })))
          ?.img,
      ).toBeUndefined();
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

describe('openEmailed (the emailed link)', () => {
  it('answers the suggestion, whatever its status, and writes nothing', async () => {
    const redis = makeRedis({ 'suggestions:sug-aaaaaa': { ...pending, status: 'approved', decidedAt: 10 } });
    expect(await openEmailed(deps({ redis }), 'sug-aaaaaa', TOKEN)).toMatchObject({
      id: 'sug-aaaaaa',
      game: 'Wingspan',
      status: 'approved',
    });
    expect(redis.hset).not.toHaveBeenCalled();
  });

  it('treats an unrecognised stored status as pending', async () => {
    const redis = makeRedis({ 'suggestions:sug-aaaaaa': { ...pending, status: 'weird' } });
    expect((await openEmailed(deps({ redis }), 'sug-aaaaaa', TOKEN)).status).toBe('pending');
  });

  it('answers a bad, unknown or mismatched link with its status', async () => {
    const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
    for (const [id, token, status, message] of [
      ['sug-aaaaaa', undefined, 400, 'This link is incomplete or mistyped. Open it again from the email.'],
      ['Bad!', TOKEN, 400, 'This link is incomplete or mistyped. Open it again from the email.'],
      ['sug-a', 'short', 400, 'This link is incomplete or mistyped. Open it again from the email.'],
      ['sug-zzzzzz', TOKEN, 404, 'There is no suggestion behind this link any more.'],
      [
        'sug-aaaaaa',
        'test-token-' + 'z'.repeat(21),
        403,
        'This link does not match the suggestion. Open it again from the email.',
      ],
    ] as const) {
      const err = await refusal(openEmailed(deps({ redis }), id, token));
      expect(err.status, `${id} ${token}`).toBe(status);
      expect(err.message).toBe(message);
    }
  });

  it('400s on an id that names one of the id lists, without reading it as a suggestion', async () => {
    const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
    for (const id of ['active', 'approved', 'unsent']) {
      expect((await refusal(byLink(deps({ redis }), { id }))).status, id).toBe(400);
      expect((await refusal(openEmailed(deps({ redis }), id, TOKEN))).status, id).toBe(400);
    }
    expect(redis.hgetall).not.toHaveBeenCalled();
  });

  it('403s, rather than crashing, on a well-formed token of a different length', async () => {
    const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
    expect((await refusal(byLink(deps({ redis }), { token: 'test-token-' + 'a'.repeat(9) }))).status).toBe(403);
    expect(redis.hset).not.toHaveBeenCalled();
  });

  it('400s on tokens with a stray character at either end, or over 64 chars', async () => {
    const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
    for (const token of ['!' + 'a'.repeat(20), 'a'.repeat(20) + '!', 'a'.repeat(65)]) {
      expect((await refusal(byLink(deps({ redis }), { token }))).status, token).toBe(400);
    }
  });

  it('400s on a non-string id or token instead of coercing them', async () => {
    const redis = makeRedis({ 'suggestions:7': { ...pending, id: '7' }, 'suggestions:sug-aaaaaa': pending });
    for (const extra of [{ id: 7 }, { token: 1e19 }, { id: undefined }]) {
      expect((await refusal(byLink(deps({ redis }), extra))).status, JSON.stringify(extra)).toBe(400);
    }
  });
});

describe('decideSuggestion', () => {
  const WINGSPAN_FOUND = {
    bggId: 266192,
    name: 'Wingspan',
    year: 2019,
    min: 1,
    max: 5,
    mins: 70,
    desc: 'Birds.',
    kw: ['strategy'],
  };
  const fresh = () => makeRedis({ 'suggestions:sug-aaaaaa': pending }, { 'suggestions:active': ['sug-aaaaaa'] });

  it('approves: flips status, adds to the approved list, keeps it active', async () => {
    const redis = fresh();
    const res = await byLink(deps({ redis }));
    expect(redis.hset).toHaveBeenCalledWith('suggestions:sug-aaaaaa', { status: 'approved', decidedAt: 5000 });
    expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
    expect(redis.lists['suggestions:active']).toEqual(['sug-aaaaaa']);
    expect(res.item).toMatchObject({ status: 'approved', name: 'Alex', game: 'Wingspan' });
    expect(res.item).not.toHaveProperty('token');
  });

  it('approving looks the game up and stores its details; the public list returns them', async () => {
    const redis = fresh();
    const lookup = vi.fn(async () => found(WINGSPAN_FOUND));
    const res = await byLink(deps({ redis, lookup }));
    expect(lookup).toHaveBeenCalledWith('Wingspan');
    expect(res.lookup).toBe('found');
    const [item] = await approvedList(deps({ redis }));
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
    const redis = fresh();
    let listedWhenLookedUp: string[] | undefined;
    const lookup = vi.fn(async () => {
      listedWhenLookedUp = [...(redis.lists['suggestions:approved'] ?? [])];
      return NO_MATCH;
    });
    await byLink(deps({ redis, lookup }));
    expect(listedWhenLookedUp).toEqual(['sug-aaaaaa']);
  });

  it('still approves when the lookup finds nothing or throws', async () => {
    for (const lookup of [
      vi.fn(async () => NO_MATCH),
      vi.fn(async () => {
        throw new Error('bgg down');
      }),
    ]) {
      const redis = fresh();
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await byLink(deps({ redis, lookup }));
      errSpy.mockRestore();
      expect(res.item?.status).toBe('approved');
      expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
      expect(redis.hashes['suggestions:sug-aaaaaa'].details).toBeUndefined();
    }
  });

  it('denies: flips status and drops it from the active list', async () => {
    const redis = makeRedis(
      { 'suggestions:sug-aaaaaa': pending },
      { 'suggestions:active': ['sug-aaaaaa', 'sug-other'] },
    );
    const res = await byLink(deps({ redis }), { decision: 'deny' });
    expect(redis.hset).toHaveBeenCalledWith('suggestions:sug-aaaaaa', { status: 'denied', decidedAt: 5000 });
    expect(redis.lists['suggestions:active']).toEqual(['sug-other']);
    expect(redis.lists['suggestions:approved']).toBeUndefined();
    expect(res).toEqual({ item: expect.objectContaining({ status: 'denied' }) as unknown });
  });

  it('approves once when the same approval arrives twice at the same moment, and from the site', async () => {
    const redis = fresh();
    const lookup = vi.fn(async () => found(WINGSPAN_FOUND));
    const d = deps({ redis, lookup });
    const [byEmail, twice, site] = await Promise.allSettled([byLink(d), byLink(d), bySite(d)]);
    expect(byEmail).toMatchObject({ status: 'fulfilled', value: { item: { status: 'approved' } } });
    expect(twice).toMatchObject({
      status: 'rejected',
      reason: { status: 409, extensions: { code: 'ALREADY_DECIDED', status: 'approved' } },
    });
    expect(site).toMatchObject({ status: 'rejected', reason: { status: 409 } });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
    expect(redis.lists['suggestions:active']).toEqual(['sug-aaaaaa']);
    expect((await approvedList(d)).map((i) => i.id)).toEqual(['sug-aaaaaa']);
  });

  it('lists an id once even if the approved list already held it', async () => {
    const redis = makeRedis(
      { 'suggestions:sug-aaaaaa': pending },
      { 'suggestions:active': ['sug-aaaaaa'], 'suggestions:approved': ['sug-aaaaaa'] },
    );
    await byLink(deps({ redis }));
    expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
  });

  it('gives the claim back when the writes fail, so the decision can be retried', async () => {
    const redis = fresh();
    const multi = redis.multi;
    redis.multi = vi.fn(() => {
      const tx = multi();
      tx.exec = async () => {
        throw new Error('redis down');
      };
      return tx;
    });
    await expect(byLink(deps({ redis }))).rejects.toThrow('redis down');
    expect(redis.hashes['suggestions:sug-aaaaaa'].decidedAt).toBeUndefined();
    redis.multi = multi;
    expect((await byLink(deps({ redis }))).item?.status).toBe('approved');
    expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
  });

  it('takes over a claim whose decision never landed, once it is a minute old', async () => {
    const stuck = { ...pending, decidedAt: 1000 };
    const held = makeRedis({ 'suggestions:sug-aaaaaa': stuck }, { 'suggestions:active': ['sug-aaaaaa'] });
    const err = await refusal(byLink(deps({ redis: held, now: () => 1000 + 59_999 })));
    expect(err.status).toBe(409);
    expect(err.message).toBe('Wingspan was already decided');
    expect(held.lists['suggestions:approved']).toBeUndefined();

    const stale = makeRedis({ 'suggestions:sug-aaaaaa': stuck }, { 'suggestions:active': ['sug-aaaaaa'] });
    expect((await byLink(deps({ redis: stale, now: () => 1000 + 60_000 }))).item?.status).toBe('approved');
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
    const results = await Promise.allSettled([byLink(late), byLink(late)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
  });

  it('does not change an already-decided suggestion, and says what it was', async () => {
    const redis = makeRedis({ 'suggestions:sug-aaaaaa': { ...pending, status: 'denied', decidedAt: 10 } });
    const err = await refusal(byLink(deps({ redis })));
    expect(redis.hset).not.toHaveBeenCalled();
    expect(err).toMatchObject({
      status: 409,
      message: 'Wingspan was already denied',
      extensions: { code: 'ALREADY_DECIDED', status: 'denied' },
    });
  });

  it('rejects a bad token, an unknown id and a bad owner id', async () => {
    const redis = makeRedis({ 'suggestions:sug-aaaaaa': pending });
    expect((await refusal(byLink(deps({ redis }), { token: 'test-token-' + 'z'.repeat(21) }))).status).toBe(403);
    expect((await refusal(byLink(deps({ redis }), { id: 'sug-zzzzzz' }))).status).toBe(404);
    const bad = await refusal(bySite(deps({ redis }), { id: 'Not A Slug' }));
    expect(bad).toMatchObject({ status: 400, message: 'invalid id' });
    const missing = await refusal(bySite(deps({ redis }), { id: 'sug-nope' }));
    expect(missing).toMatchObject({ status: 404, message: 'suggestion not found' });
    expect(redis.hset).not.toHaveBeenCalled();
  });

  it('approves from the site with enrichment, box art included', async () => {
    const redis = fresh();
    const lookup = vi.fn(async () => found({ ...WINGSPAN_FOUND, bggId: 1, img: 'https://cf.geekdo-images.com/w.jpg' }));
    const res = await bySite(deps({ redis, lookup }));
    expect(res.item).toMatchObject({
      id: 'sug-aaaaaa',
      status: 'approved',
      decidedAt: 5000,
      details: { min: 1, max: 5, mins: 70, desc: 'Birds.', img: 'https://cf.geekdo-images.com/w.jpg' },
    });
    expect(res.item).not.toHaveProperty('token');
    expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
  });

  it('denies from the site, and refuses to decide twice', async () => {
    const redis = fresh();
    expect((await bySite(deps({ redis }), { decision: 'deny' })).item).toMatchObject({ status: 'denied' });
    expect(redis.lists['suggestions:active']).toEqual([]);
    expect((await refusal(bySite(deps({ redis })))).message).toBe('Wingspan was already denied');
  });

  describe('unsent records (send call failed after possible delivery)', () => {
    const unsent = { ...pending, status: 'unsent' };

    it('approving puts it back on the active list as well as the approved list', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': unsent }, { 'suggestions:active': [] });
      expect((await byLink(deps({ redis }))).item?.status).toBe('approved');
      expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
      expect(redis.lists['suggestions:active']).toEqual(['sug-aaaaaa']);
    });

    it('denying leaves it out of both lists', async () => {
      const redis = makeRedis({ 'suggestions:sug-aaaaaa': unsent }, { 'suggestions:active': [] });
      expect((await byLink(deps({ redis }), { decision: 'deny' })).item?.status).toBe('denied');
      expect(redis.lists['suggestions:active']).toEqual([]);
      expect(redis.lists['suggestions:approved']).toBeUndefined();
    });

    it('drops it from the unsent list once the owner decides it', async () => {
      const redis = makeRedis(
        { 'suggestions:sug-unsent': { ...pending, id: 'sug-unsent', status: 'unsent' } },
        { 'suggestions:unsent': ['sug-unsent', 'sug-other'] },
      );
      await bySite(deps({ redis }), { id: 'sug-unsent' });
      expect(redis.lists['suggestions:unsent']).toEqual(['sug-other']);
      expect(redis.lists['suggestions:active']).toEqual(['sug-unsent']);
      expect(redis.lists['suggestions:approved']).toEqual(['sug-unsent']);
    });
  });
});

describe('pendingList', () => {
  it('lists what still needs a decision, newest first, without tokens, including unsent ones', async () => {
    const redis = makeRedis(
      {
        'suggestions:sug-old': { ...pending, id: 'sug-old', createdAt: 100 },
        'suggestions:sug-new': { ...pending, id: 'sug-new', createdAt: 300 },
        'suggestions:sug-unsent': { ...pending, id: 'sug-unsent', createdAt: 200, status: 'unsent' },
        'suggestions:sug-ok': { ...pending, id: 'sug-ok', game: 'Root', status: 'approved', decidedAt: 2000 },
      },
      { 'suggestions:active': ['sug-old', 'sug-ok', 'sug-new'], 'suggestions:unsent': ['sug-unsent', 'sug-old'] },
    );
    const items = await pendingList(deps({ redis }));
    expect(items.map((i) => i.id)).toEqual(['sug-new', 'sug-unsent', 'sug-old']);
    expect(items.every((i) => !('token' in i))).toBe(true);
    expect(items[0]).toMatchObject({ status: 'pending', source: 'friend' });
    expect(items[1]).toMatchObject({ status: 'unsent' });
  });
});

describe('suggestGame', () => {
  it('refuses with 503 when email is not configured', async () => {
    expect(await refusal(suggestGame(deps({ mailer: null }), valid))).toMatchObject({
      status: 503,
      message: 'Suggestions are not open yet',
    });
  });

  it('validates game, name and note', async () => {
    for (const input of [
      { ...valid, game: 'A' },
      { ...valid, game: 'x'.repeat(81) },
      { ...valid, game: `Bell${BELL}here` },
      { ...valid, name: '' },
      { ...valid, name: '<script>' },
      { ...valid, note: 'n'.repeat(201) },
    ]) {
      expect((await refusal(suggestGame(deps(), input))).status, JSON.stringify(input)).toBe(400);
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
    await suggestGame(deps({ redis, mailer }), valid);
    expect(order).toEqual(['hset:suggestions:sug-bbbbbb', 'send']);
  });

  it("emails the owner links to the app's approve and deny pages and stores it as pending and active", async () => {
    const d = deps();
    const item = await suggestGame(d, { ...valid, game: '  Cascadia   ' });
    expect(item).toEqual({
      id: 'sug-bbbbbb',
      game: 'Cascadia',
      name: 'Sam',
      note: 'Calm and quick',
      status: 'pending',
      createdAt: 5000,
      decidedAt: undefined,
      details: undefined,
      source: 'friend',
    });
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0].subject).toBe('Game suggestion: Cascadia (from Sam)');
    expect(d.sent[0].html).toContain(`https://games.example/approve?id=sug-bbbbbb&token=${NEW_TOKEN}`);
    expect(d.sent[0].html).toContain(`https://games.example/deny?id=sug-bbbbbb&token=${NEW_TOKEN}`);
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
    await suggestGame(d, { ...valid, game: 'Tak <3', note: '<img src=x>' });
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
    await expect(suggestGame(deps({ redis, mailer: { send } }), valid)).rejects.toThrow('resend timed out');
    expect(redis.hashes['suggestions:sug-bbbbbb'].status).toBe('approved');
    expect(redis.lists['suggestions:active']).toEqual(['sug-bbbbbb']);
    expect(redis.lists['suggestions:unsent']).toBeUndefined();
  });

  it('rolls the record out of the active list when the email fails, so a retry is not a duplicate', async () => {
    const redis = makeRedis();
    const failing = deps({
      redis,
      mailer: {
        send: vi.fn(async () => {
          throw new Error('resend down');
        }),
      },
    });
    await expect(suggestGame(failing, valid)).rejects.toThrow('resend down');
    expect(redis.lists['suggestions:active']).toEqual([]);
    expect(redis.hashes['suggestions:sug-bbbbbb'].status).toBe('unsent');
    // Tracked so the owner's on-site queue can still surface it.
    expect(redis.lists['suggestions:unsent']).toEqual(['sug-bbbbbb']);
    const ok = deps({ redis, randomId: () => 'sug-cccccc' });
    expect((await suggestGame(ok, valid)).id).toBe('sug-cccccc');
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
      await expect(suggestGame(deps({ redis, mailer: resendMailer(hanging, 10) }), valid)).rejects.toThrow();
      expect(hanging).toHaveBeenCalledTimes(1);
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
    await expect(suggestGame(d, valid)).rejects.toThrow('redis down');
    expect(d.sent).toHaveLength(0);
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
    const waiting = await refusal(suggestGame(deps({ redis }), { ...valid, game: 'cascadia' }));
    expect(waiting.status).toBe(409);
    expect(waiting.message).toContain('waiting for approval');
    const listed = await refusal(suggestGame(deps({ redis }), { ...valid, game: 'AZUL' }));
    expect(listed.status).toBe(409);
    expect(listed.message).toContain('already on the wishlist');
    expect((await suggestGame(deps({ redis }), { ...valid, game: 'Root' })).game).toBe('Root');
  });

  it('lets a denied game be suggested again even if its id lingers on the active list', async () => {
    const redis = makeRedis(
      { 'suggestions:sug-d': { ...pending, id: 'sug-d', game: 'Root', status: 'denied', decidedAt: 1 } },
      { 'suggestions:active': ['sug-d'] },
    );
    expect((await suggestGame(deps({ redis }), { ...valid, game: 'Root' })).status).toBe('pending');
  });

  it('ignores punctuation and whitespace differences when spotting a duplicate', async () => {
    const redis = makeRedis(
      { 'suggestions:sug-w': { ...pending, id: 'sug-w', game: '7 Wonders' } },
      { 'suggestions:active': ['sug-w'] },
    );
    expect((await refusal(suggestGame(deps({ redis }), { ...valid, game: '7 - Wonders!!' }))).message).toBe(
      '7 Wonders has already been suggested and is waiting for approval',
    );
  });

  describe('input shaping', () => {
    it('rejects names with a leading or trailing invalid character, with the message', async () => {
      for (const name of ['!Bob', 'Bob!!']) {
        expect((await refusal(suggestGame(deps(), { ...valid, name }))).message, name).toBe(
          'name must be 1–30 letters, digits, spaces or basic punctuation',
        );
      }
    });

    it('rejects a non-string game or name with 400, not a crash', async () => {
      expect((await refusal(suggestGame(deps(), { ...valid, game: 42 }))).message).toBe('game must be 2–80 characters');
      expect((await refusal(suggestGame(deps(), { ...valid, name: 42 }))).status).toBe(400);
    });

    it('treats a missing or null note as empty', async () => {
      for (const note of [null, undefined]) {
        const d = deps();
        await suggestGame(d, { ...valid, note });
        expect(d.redis.hset).toHaveBeenCalledWith('suggestions:sug-bbbbbb', expect.objectContaining({ note: '' }));
      }
    });

    it('trims game, name and note and collapses internal whitespace before storing', async () => {
      const d = deps();
      await suggestGame(d, { game: '  Terra   Mystica \t Rules ', name: '  Sam  ', note: ' so   good\n\nreally ' });
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
      expect((await suggestGame(deps(), { ...valid, game: 'Go' })).game).toBe('Go');
      expect((await suggestGame(deps(), { ...valid, game: 'x'.repeat(80) })).game).toHaveLength(80);
      expect((await refusal(suggestGame(deps(), { ...valid, game: 'x'.repeat(81) }))).message).toBe(
        'game must be 2–80 characters',
      );
    });

    it('accepts a note at exactly the max length and rejects one over, with the message', async () => {
      expect((await suggestGame(deps(), { ...valid, note: 'n'.repeat(200) })).note).toHaveLength(200);
      expect((await refusal(suggestGame(deps(), { ...valid, note: 'n'.repeat(201) }))).message).toBe(
        'note must be at most 200 characters',
      );
    });
  });
});

describe('owner actions', () => {
  const approvedItem = {
    ...pending,
    id: 'sug-ok',
    game: 'Root',
    status: 'approved',
    decidedAt: 2000,
    details: JSON.stringify({ min: 2, max: 4, mins: 90, desc: 'Woodland war.', kw: ['strategy'] }),
  };

  describe('addGame (straight onto the wishlist)', () => {
    const add = (input: Record<string, unknown>, d = deps()) =>
      addGame(d, { game: 'Cascadia', name: 'Jess', ...input });

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
      const d = deps({ lookup });
      const res = await add({ type: 'strategy', note: 'Calm' }, d);
      expect(res).toMatchObject({
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
        lookup: 'found',
      });
      expect(d.redis.lists['suggestions:approved']).toEqual(['sug-bbbbbb']);
      expect(d.redis.lists['suggestions:active']).toEqual(['sug-bbbbbb']);
      expect(d.sent).toHaveLength(0);
    });

    it('keeps the chosen section even when BoardGameGeek has nothing, and no details otherwise', async () => {
      const typed = await add({ type: 'party' }, deps({ lookup: async () => NO_MATCH }));
      expect(typed).toMatchObject({ item: { details: { min: 1, max: 99, mins: 0, desc: '', kw: [], type: 'party' } } });
      const untyped = await add({ type: null }, deps({ lookup: async () => NO_MATCH }));
      expect(untyped.item?.details).toBeUndefined();
    });

    it('validates the game, the name, the note and the section', async () => {
      expect((await refusal(add({ game: 'X' }))).message).toBe('game must be 2–80 characters');
      expect((await refusal(add({ name: '!!' }))).status).toBe(400);
      expect((await refusal(add({ type: 'suggested' }))).message).toBe('unknown wishlist type');
      expect((await refusal(add({ note: 'x'.repeat(201) }))).status).toBe(400);
    });

    it('refuses a game already on the list', async () => {
      const redis = makeRedis({ 'suggestions:sug-ok': approvedItem }, { 'suggestions:active': ['sug-ok'] });
      expect(await refusal(add({ game: 'root' }, deps({ redis })))).toMatchObject({
        status: 409,
        message: 'Root is already on the list',
      });
    });

    it('answers with the outcome beside the item, and none when no lookup ran', async () => {
      for (const [result, outcome] of [
        [found({ bggId: 1, name: 'Wingspan', min: 1, max: 5, mins: 70, desc: '', kw: [] }), 'found'],
        [NO_MATCH, 'no-match'],
        [{ outcome: 'unavailable' }, 'unavailable'],
      ] as const) {
        expect(await add({ game: 'Wingspan' }, deps({ lookup: async () => result }))).toMatchObject({
          item: { game: 'Wingspan' },
          lookup: outcome,
        });
      }
      expect((await add({ game: 'Wingspan' }, deps({ lookup: null }))).lookup).toBeUndefined();
    });
  });

  describe('addGame with previewed details', () => {
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
    const add = async (input: Record<string, unknown>) => {
      const lookup = vi.fn(async () => NO_MATCH);
      const d = deps({ lookup });
      let res: Awaited<ReturnType<typeof addGame>> | undefined;
      let error: ApiError | undefined;
      try {
        res = await addGame(d, { game: 'Wingspan', name: 'Jess', ...input });
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        error = err;
      }
      const raw = d.redis.hashes['suggestions:sug-bbbbbb']?.details;
      return {
        res,
        error,
        lookup,
        redis: d.redis,
        stored: raw === undefined ? undefined : (JSON.parse(String(raw)) as Record<string, unknown>),
      };
    };

    it('stores them with the section, without looking the game up again', async () => {
      const { res, lookup, stored, redis } = await add({ details: { ...PREVIEWED, type: 'party' }, type: 'strategy' });
      expect(lookup).not.toHaveBeenCalled();
      expect(stored).toEqual({ ...PREVIEWED, type: 'strategy' });
      expect(res).toMatchObject({ item: { status: 'approved', details: { ...PREVIEWED, type: 'strategy' } } });
      expect(res?.lookup).toBeUndefined();
      expect(redis.lists['suggestions:approved']).toEqual(['sug-bbbbbb']);
    });

    it('takes a section only from the add, never from the details', async () => {
      expect((await add({ details: { ...PREVIEWED, type: 'party' } })).stored).toEqual(PREVIEWED);
    });

    it('drops a section it does not know from the details instead of refusing the add', async () => {
      const { res, stored } = await add({ details: { ...PREVIEWED, type: 'no-such-section' }, type: 'party' });
      expect(res?.item?.status).toBe('approved');
      expect(stored).toEqual({ ...PREVIEWED, type: 'party' });
    });

    it('adds what a preview answered for a BGG entry past the bounds (999 players, 720 minutes, a soft hyphen)', async () => {
      const crowd = parseThing(
        '<items><item type="boardgame" id="7"><name type="primary" value="Crowd"/><description>Every&#173;one plays.</description><minplayers value="3"/><maxplayers value="999"/><playingtime value="720"/></item></items>',
      )!;
      const previewed = await previewGame(deps({ lookup: async () => found(crowd) }), 'Crowd');
      // Sent back as the client sends it: through JSON, as the add's details.
      const { details } = JSON.parse(JSON.stringify(previewed)) as { details: Record<string, unknown> };
      delete details.name;
      const { stored } = await add({ details });
      expect(stored).toEqual({ bggId: 7, min: 3, max: PLAYERS_MAX, mins: MINS_MAX, desc: 'Everyone plays.', kw: [] });
    });

    it('adds without details when the owner chose to, keeping the section', async () => {
      const typed = await add({ details: null, type: 'party' });
      expect(typed.lookup).not.toHaveBeenCalled();
      expect(typed.stored).toEqual({ min: 1, max: 99, mins: 0, desc: '', kw: [], type: 'party' });
      const bare = await add({ details: null });
      expect(bare.lookup).not.toHaveBeenCalled();
      expect(bare.stored).toBeUndefined();
      expect(bare.res?.item?.status).toBe('approved');
    });

    it("holds previewed details to an edit's rules and stores nothing when they fail", async () => {
      for (const [details, message] of [
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
        const { error, redis } = await add({ details });
        expect(error, JSON.stringify(details).slice(0, 80)).toMatchObject({ status: 400, message });
        expect(redis.hashes).toEqual({});
      }
    });

    it('accepts a game BGG dates before the common era, and details without the optional fields', async () => {
      expect((await add({ details: { ...PREVIEWED, year: -2200 } })).stored).toMatchObject({ year: -2200 });
      const { stored } = await add({ details: { min: 2, max: 2, mins: 20, desc: '', kw: [] } });
      expect(stored).toEqual({ min: 2, max: 2, mins: 20, desc: '', kw: [] });
    });
  });

  describe('editSuggestion', () => {
    const edit = async (
      input: Record<string, unknown>,
      redis = makeRedis({ 'suggestions:sug-ok': approvedItem }, { 'suggestions:approved': ['sug-ok'] }),
    ) => ({ res: await editSuggestion(deps({ redis }), { id: 'sug-ok', ...input }), redis });
    const editError = (input: Record<string, unknown>) =>
      refusal(
        editSuggestion(deps({ redis: makeRedis({ 'suggestions:sug-ok': approvedItem }) }), { id: 'sug-ok', ...input }),
      );

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
      const { res } = await edit({ details: { mins: 60, img: 'https://evil.example/x.jpg' } }, redis);
      expect(res).toMatchObject({ details: { mins: 60, img: 'https://cf.geekdo-images.com/r.jpg' } });
    });

    it('merges the given details over the stored ones and renames', async () => {
      const { res, redis } = await edit({
        game: '  Root:  A Game  ',
        note: 'Mean',
        details: { mins: 60, kw: ['strategy', 'thematic', 'strategy'], type: 'heavy' },
      });
      expect(res).toMatchObject({
        game: 'Root: A Game',
        note: 'Mean',
        details: { min: 2, max: 4, mins: 60, desc: 'Woodland war.', kw: ['strategy', 'thematic'], type: 'heavy' },
      });
      expect(JSON.parse(String(redis.hashes['suggestions:sug-ok'].details))).toMatchObject({ mins: 60, type: 'heavy' });
    });

    it("clears the section with null and folds the textarea's line breaks into the description", async () => {
      const { res } = await edit({ details: { type: null, desc: '  Two \n\n lines. ' } });
      expect(res?.details?.type).toBeUndefined();
      expect(res?.details?.desc).toBe('Two lines.');
    });

    it('rejects out-of-range or malformed edits with the reason', async () => {
      expect((await editError({ details: { min: 5, max: 2 } })).message).toBe(
        'players must be whole numbers from 1 to 99, min at most max',
      );
      expect((await editError({ details: { mins: 601 } })).message).toBe(
        'minutes must be a whole number from 0 to 600',
      );
      expect((await editError({ details: { min: 1.5 } })).status).toBe(400);
      expect((await editError({ details: { min: null } })).status).toBe(400);
      expect((await editError({ details: { desc: 'x'.repeat(DESC_MAX + 1) } })).status).toBe(400);
      expect((await editError({ details: { kw: ['Not Valid'] } })).message).toBe(
        'keywords must be a short list of keyword ids',
      );
      expect((await editError({ details: { kw: ['not-a-real-keyword'] } })).status).toBe(400);
      expect((await editError({ details: { kw: [42] } })).status).toBe(400);
      expect((await editError({ details: { type: 'suggested' } })).message).toBe('unknown wishlist type');
      expect((await editError({ details: 'nope' })).message).toBe('details must be an object');
      expect((await editError({ details: [{ mins: 60 }] })).message).toBe('details must be an object');
      expect((await editError({ game: 'X' })).status).toBe(400);
      expect((await editError({ note: null })).message).toBe('note must be at most 200 characters');
      expect((await editError({ note: 42 })).status).toBe(400);
      expect((await editError({})).message).toBe('nothing to change');
    });

    it('starts from defaults when a game has no details yet', async () => {
      const redis = makeRedis({ 'suggestions:sug-bare': { ...pending, id: 'sug-bare', status: 'approved' } });
      expect(await editSuggestion(deps({ redis }), { id: 'sug-bare', details: { mins: 30 } })).toMatchObject({
        details: { min: 1, max: 99, mins: 30, desc: '', kw: [] },
      });
    });

    it('will not edit a removed or denied game, or one that does not exist', async () => {
      const redis = makeRedis({ 'suggestions:sug-gone': { ...pending, id: 'sug-gone', status: 'removed' } });
      expect((await refusal(editSuggestion(deps({ redis }), { id: 'sug-gone', game: 'Root' }))).status).toBe(409);
      expect((await refusal(editSuggestion(deps({ redis }), { id: 'sug-nope', game: 'Root' }))).status).toBe(404);
    });
  });

  describe('removeSuggestion', () => {
    it('drops it from both lists and marks it removed, keeping the hash', async () => {
      const redis = makeRedis(
        { 'suggestions:sug-ok': approvedItem },
        { 'suggestions:approved': ['sug-ok', 'sug-other'], 'suggestions:active': ['sug-ok'] },
      );
      await removeSuggestion(deps({ redis }), 'sug-ok');
      expect(redis.lists['suggestions:approved']).toEqual(['sug-other']);
      expect(redis.lists['suggestions:active']).toEqual([]);
      expect(redis.hashes['suggestions:sug-ok']).toMatchObject({ status: 'removed', decidedAt: 5000, game: 'Root' });
      // A later public read no longer shows it.
      expect(await approvedList(deps({ redis }))).toEqual([]);
    });

    it('400s on an id that names one of the id lists, without reading it as a suggestion', async () => {
      const redis = makeRedis();
      expect((await refusal(removeSuggestion(deps({ redis }), 'approved'))).status).toBe(400);
      expect(redis.hgetall).not.toHaveBeenCalled();
    });

    it('only removes what is on the wishlist: a pending or already-removed record answers 409 untouched', async () => {
      for (const status of ['pending', 'unsent', 'denied', 'removed']) {
        const redis = makeRedis(
          { 'suggestions:sug-x': { ...pending, id: 'sug-x', status } },
          { 'suggestions:active': ['sug-x'], 'suggestions:unsent': ['sug-x'] },
        );
        expect(await refusal(removeSuggestion(deps({ redis }), 'sug-x'))).toMatchObject({
          status: 409,
          message: 'Wingspan is not on the wishlist',
        });
        expect(redis.hashes['suggestions:sug-x'].status).toBe(status);
        expect(redis.lists['suggestions:active']).toEqual(['sug-x']);
        expect(redis.lists['suggestions:unsent']).toEqual(['sug-x']);
      }
    });

    it('reports an unknown id', async () => {
      expect((await refusal(removeSuggestion(deps(), 'sug-nope'))).status).toBe(404);
    });
  });

  it('knows the same keyword ids and wishlist sections as the client', () => {
    expect([...KEYWORD_IDS].sort()).toEqual(Object.keys(KW).sort());
    expect([...WISHLIST_SECTION_IDS].sort()).toEqual([...WISHLIST_SECTIONS].sort());
  });

  it("puts the same bounds on an entry as the client's forms", () => {
    const { NAME_MAX, ...bounds } = clientLimits;
    expect(bounds).toEqual({ GAME_MIN, GAME_MAX, NOTE_MAX, DESC_MAX, PLAYERS_MAX, MINS_MAX });
    // The name's bound lives in NAME_RE: the longest name it takes is the form's.
    expect(NAME_RE.test('x'.repeat(NAME_MAX))).toBe(true);
    expect(NAME_RE.test('x'.repeat(NAME_MAX + 1))).toBe(false);
  });
});

describe('BoardGameGeek token problems', () => {
  const reported = () =>
    vi.mocked(reportError).mock.calls.map(([label, err]) => ({ label, message: (err as Error).message }));

  it('reports a missing token to Sentry by name, and still adds the game', async () => {
    vi.mocked(reportError).mockClear();
    const res = await addGame(deps({ lookup: async () => ({ outcome: 'no-token' }) }), {
      game: 'Magical Athlete',
      name: 'Jess',
    });
    expect(res.item?.status).toBe('approved');
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
    const res = await byLink(deps({ redis, lookup: async () => ({ outcome: 'refused', status }) }));
    expect(res).toMatchObject({ item: { status: 'approved' }, lookup: 'refused' });
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
      await addGame(deps({ lookup: async () => result }), { game: 'Magical Athlete', name: 'Jess' });
    }
    expect(reportError).not.toHaveBeenCalled();
  });
});

describe('previewGame (looking a game up before adding it)', () => {
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

  it('answers what BoardGameGeek found, and stores nothing', async () => {
    const lookup = vi.fn(async () => found(WINGSPAN));
    const d = deps({ lookup });
    expect(await previewGame(d, '  Wingspan ')).toEqual({ outcome: 'found', details: WINGSPAN });
    expect(lookup).toHaveBeenCalledWith('Wingspan');
    expect(d.redis.hashes).toEqual({});
    expect(d.redis.lists).toEqual({});
  });

  it('answers why it found nothing', async () => {
    expect(await previewGame(deps({ lookup: async () => NO_MATCH }), 'Wingspan')).toEqual(NO_MATCH);
    expect(
      (
        await previewGame(
          deps({
            lookup: async () => {
              throw new Error('bgg down');
            },
          }),
          'Wingspan',
        )
      ).outcome,
    ).toBe('unavailable');
    expect(await previewGame(deps({ lookup: null }), 'Wingspan')).toEqual({ outcome: 'unavailable' });
  });

  it('reports a missing token to Sentry here too', async () => {
    vi.mocked(reportError).mockClear();
    expect(await previewGame(deps({ lookup: async () => ({ outcome: 'no-token' }) }), 'Wingspan')).toEqual({
      outcome: 'no-token',
    });
    expect(vi.mocked(reportError).mock.calls.map(([, err]) => (err as Error).message)).toEqual([
      expect.stringContaining('BGG_API_TOKEN'),
    ]);
  });

  it('validates the name before looking anything up', async () => {
    const lookup = vi.fn(async () => found(WINGSPAN));
    expect(await refusal(previewGame(deps({ lookup }), 'X'))).toMatchObject({
      status: 400,
      message: 'game must be 2–80 characters',
    });
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('approving with what the owner saw (a corrected name, previewed details)', () => {
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
    return { redis, lookup, d: deps({ redis, lookup }) };
  }
  const stored = (redis: Redis) => redis.hashes['suggestions:sug-aaaaaa'];
  /** The one HSET the approval made, its details read back from their JSON. */
  const oneWrite = (redis: Redis) => {
    expect(redis.hset).toHaveBeenCalledTimes(1);
    const [key, fields] = redis.hset.mock.calls[0];
    expect(key).toBe('suggestions:sug-aaaaaa');
    return { ...fields, details: JSON.parse(String(fields.details)) as unknown };
  };
  const untouched = (redis: Redis) => {
    expect(stored(redis).status).toBe('pending');
    expect(stored(redis).decidedAt).toBeUndefined();
    expect(stored(redis).game).toBe('Arkham Horry');
    expect(redis.lists['suggestions:approved']).toBeUndefined();
  };

  for (const [where, decide] of [
    ['from the site', bySite],
    ['from the emailed link', byLink],
  ] as const) {
    describe(where, () => {
      it('stores the previewed details and the corrected name with the status, without looking it up again', async () => {
        const { d, redis, lookup } = setup();
        const res = await decide(d, {
          game: '  Arkham   Horror ',
          details: { ...ARKHAM, name: 'BGG name', type: 'party' },
        });
        expect(lookup).not.toHaveBeenCalled();
        // One write: the name, the details and the status land together.
        expect(oneWrite(redis)).toEqual({
          status: 'approved',
          decidedAt: 5000,
          game: 'Arkham Horror',
          details: ARKHAM,
        });
        expect(res).toEqual({
          item: expect.objectContaining({
            game: 'Arkham Horror',
            status: 'approved',
            name: 'Robin',
            details: ARKHAM,
          }) as unknown,
        });
        expect(redis.lists['suggestions:approved']).toEqual(['sug-aaaaaa']);
      });

      it('approves with no details, and no lookup, when the preview found nothing', async () => {
        const { d, redis, lookup } = setup();
        const res = await decide(d, { details: null });
        expect(lookup).not.toHaveBeenCalled();
        expect(stored(redis)).toMatchObject({ status: 'approved', game: 'Arkham Horry' });
        expect(stored(redis).details).toBeUndefined();
        expect(res.lookup).toBeUndefined();
      });

      it('looks a corrected name up itself when no details came with it', async () => {
        const { d, redis, lookup } = setup();
        const res = await decide(d, { game: 'Arkham Horror' });
        expect(lookup).toHaveBeenCalledWith('Arkham Horror');
        expect(res).toMatchObject({ item: { game: 'Arkham Horror', details: ARKHAM }, lookup: 'found' });
        expect(stored(redis).game).toBe('Arkham Horror');
      });

      it("holds the details to an add's rules, and the name to an add's, storing nothing when they fail", async () => {
        for (const [input, message] of [
          [{ details: { ...ARKHAM, min: 5, max: 2 } }, 'players must be whole numbers from 1 to 99, min at most max'],
          [{ details: { ...ARKHAM, img: 'http://insecure.example/x.jpg' } }, 'img must be a BoardGameGeek image URL'],
          [{ details: JSON.stringify(ARKHAM) }, 'details must be an object'],
          [{ details: [ARKHAM] }, 'details must be an object'],
          [{ game: 'X' }, 'game must be 2–80 characters'],
          [{ game: 42 }, 'game must be 2–80 characters'],
        ] as const) {
          const { d, redis, lookup } = setup();
          expect(await refusal(decide(d, input)), JSON.stringify(input)).toMatchObject({ status: 400, message });
          untouched(redis);
          expect(lookup).not.toHaveBeenCalled();
        }
      });

      it('refuses a correction onto a game another entry already lists', async () => {
        const { d, redis } = setup(misspelt, { 'suggestions:sug-cccccc': other });
        expect(await refusal(decide(d, { game: 'arkham horror', details: ARKHAM }))).toMatchObject({
          status: 409,
          message: 'Arkham Horror is already on the list',
        });
        untouched(redis);
      });

      it('lets a name be corrected to another spelling of itself', async () => {
        const { d, redis } = setup();
        await decide(d, { game: 'arkham horry', details: null });
        expect(stored(redis).game).toBe('arkham horry');
      });

      it('leaves a denial as it was, whatever else comes with it', async () => {
        const { d, redis, lookup } = setup();
        await decide(d, { decision: 'deny', game: 'X', details: 'nope' });
        expect(stored(redis)).toMatchObject({ status: 'denied', game: 'Arkham Horry' });
        expect(lookup).not.toHaveBeenCalled();
      });
    });
  }

  it('checks the token before anything else', async () => {
    const { d, redis } = setup();
    expect((await refusal(byLink(d, { token: 'test-token-' + 'z'.repeat(21), details: 'nope' }))).status).toBe(403);
    untouched(redis);
  });

  describe('previewEmailed (what the approve page shows)', () => {
    const noWrites = (redis: Redis) => {
      for (const write of [redis.hset, redis.hsetnx, redis.hdel, redis.lpush, redis.lrem, redis.multi])
        expect(write).not.toHaveBeenCalled();
    };
    const open = async (ctx: ReturnType<typeof setup>) => openEmailed(ctx.d, 'sug-aaaaaa', TOKEN);

    it("looks the friend's spelling up, without writing anything", async () => {
      const ctx = setup({ ...misspelt, game: 'Arkham Horror' });
      expect(await previewEmailed(ctx.d, await open(ctx), undefined)).toEqual(found(ARKHAM_FOUND));
      expect(ctx.lookup).toHaveBeenCalledTimes(1);
      expect(ctx.lookup).toHaveBeenCalledWith('Arkham Horror');
      noWrites(ctx.redis);
    });

    it('looks a corrected name up, and still writes nothing', async () => {
      const ctx = setup();
      expect(await previewEmailed(ctx.d, await open(ctx), ' Arkham  Horror ')).toEqual(found(ARKHAM_FOUND));
      expect(ctx.lookup).toHaveBeenCalledWith('Arkham Horror');
      expect(await previewEmailed(ctx.d, await open(ctx), null)).toEqual(NO_MATCH);
      noWrites(ctx.redis);
    });

    it('answers a bad name with a 400, looking nothing up', async () => {
      for (const game of ['X', 'x'.repeat(GAME_MAX + 1)]) {
        const ctx = setup();
        expect(await refusal(previewEmailed(ctx.d, await open(ctx), game))).toMatchObject({
          status: 400,
          extensions: { code: 'BAD_NAME' },
          message: `Nothing was looked up: the game must be ${GAME_MIN}–${GAME_MAX} characters.`,
        });
        expect(ctx.lookup).not.toHaveBeenCalled();
      }
    });

    it('never looks up for a decided suggestion, or with no lookup configured', async () => {
      const decided = setup({ ...misspelt, status: 'approved', decidedAt: 10 });
      expect(await previewEmailed(decided.d, await open(decided), 'Arkham Horror')).toBeNull();
      expect(decided.lookup).not.toHaveBeenCalled();
      const bare = setup();
      expect(await previewEmailed(deps({ redis: bare.redis, lookup: null }), await open(bare), undefined)).toBeNull();
    });
  });
});
