// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { WISHLIST_IDS } from '../../api/_lib/wishlistIds';
import type { VotesPipeline } from '../../api/_resolvers/votes';
import { WISHLIST } from '../data/wishlist';
import { refusing, testApi, type TestApi } from './helpers/api';

/** `n` voters other than the one asking. */
const voters = (n: number) => Array.from({ length: n }, (_, i) => `anon-other-${i}`);

const READ =
  'query ($ids: [String!]!, $anonId: String) { wishlistVotes(ids: $ids, anonId: $anonId) { counts { id count } myVotes } }';
const VOTE =
  'mutation ($itemId: String!, $anonId: String!, $vote: Int!) { vote(itemId: $itemId, anonId: $anonId, vote: $vote) { itemId count myVote } }';

const withSets = (sets: Record<string, string[]>) => {
  const api = testApi();
  for (const [key, members] of Object.entries(sets)) api.redis.sets[key] = new Set(members);
  return api;
};

const read = (api: TestApi, ids: string[], anonId?: string) => api.run(READ, { ids, anonId });
const vote = (api: TestApi, itemId: string, v = 1, anonId = 'anon-1234567') =>
  api.run(VOTE, { itemId, anonId, vote: v });

describe('wishlistVotes', () => {
  it('refuses no ids, or more than 100', async () => {
    const none = await read(testApi(), []);
    expect(none.status).toBe(400);
    expect(none.errors[0]).toMatchObject({ message: 'ids is required', extensions: { code: 'BAD_REQUEST' } });
    const many = await read(
      testApi(),
      Array.from({ length: 101 }, (_, i) => `x${i}`),
    );
    expect(many.status).toBe(400);
    expect(many.errors[0].message).toBe('too many ids (max 100)');
  });

  it('accepts exactly 100 ids (the cap is inclusive)', async () => {
    const res = await read(
      testApi(),
      Array.from({ length: 100 }, (_, i) => `g${i}`),
    );
    expect(res.status).toBe(200);
  });

  it('drops malformed ids, and refuses a list with none left', async () => {
    const api = withSets({
      'wishlist:votes:a': voters(3),
      'wishlist:votes:b': voters(5),
      'wishlist:votes:c': voters(5),
    });
    const res = await read(api, ['a', 'b', 'INVALID ID!', ' c ']);
    expect(res.data?.wishlistVotes).toEqual({
      counts: [
        { id: 'a', count: 3 },
        { id: 'b', count: 5 },
        { id: 'c', count: 5 },
      ],
      myVotes: [],
    });
    const bad = await read(api, ['NOPE!']);
    expect(bad.status).toBe(400);
    expect(bad.errors[0].message).toMatch(/at least one valid slug/);
  });

  it('says which this browser voted for, given its id, and ignores a malformed one', async () => {
    const api = withSets({ 'wishlist:votes:a': ['anon-1234567', ...voters(1)], 'wishlist:votes:b': voters(7) });
    expect((await read(api, ['a', 'b'], 'anon-1234567')).data?.wishlistVotes).toEqual({
      counts: [
        { id: 'a', count: 2 },
        { id: 'b', count: 7 },
      ],
      myVotes: ['a'],
    });
    expect((await read(api, ['a'], 'bad id!')).data?.wishlistVotes).toEqual({
      counts: [{ id: 'a', count: 2 }],
      myVotes: [],
    });
  });

  it('is limited per IP', async () => {
    const api = testApi((d) => ({ limiters: { ...d.limiters, votes: refusing() } }));
    const res = await read(api, ['a']);
    expect(res.status).toBe(429);
    expect(res.errors[0]).toMatchObject({
      message: 'Too many requests. Please slow down.',
      extensions: { code: 'RATE_LIMITED' },
    });
  });

  it('answers 500, reported, when Redis fails', async () => {
    const broken: VotesPipeline = {
      scard: () => broken,
      sismember: () => broken,
      exec: async () => {
        throw new Error('redis down');
      },
    };
    const api = testApi((d) => ({ redis: { ...d.redis, pipeline: () => broken } }));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await read(api, ['a']);
    expect(res.status).toBe(500);
    expect(res.errors[0]).toMatchObject({ message: 'Server error', extensions: { code: 'INTERNAL_SERVER_ERROR' } });
    expect(errSpy).toHaveBeenCalledWith('votes api error:', expect.any(Error));
    errSpy.mockRestore();
  });
});

describe('vote', () => {
  it('adds a vote and answers the new count', async () => {
    const api = withSets({ 'wishlist:votes:lost-cities': voters(3) });
    const res = await vote(api, 'lost-cities');
    expect(api.redis.sadd).toHaveBeenCalledWith('wishlist:votes:lost-cities', 'anon-1234567');
    expect(res.data?.vote).toEqual({ itemId: 'lost-cities', count: 4, myVote: 1 });
  });

  it('takes a vote back', async () => {
    const api = withSets({ 'wishlist:votes:dominion-seaside': ['anon-1234567', ...voters(2)] });
    const res = await vote(api, 'dominion-seaside', 0);
    expect(api.redis.srem).toHaveBeenCalledWith('wishlist:votes:dominion-seaside', 'anon-1234567');
    expect(res.data?.vote).toEqual({ itemId: 'dominion-seaside', count: 2, myVote: 0 });
  });

  it.each([
    ['BadId!', 1, 'anon-1234567', 'invalid itemId'],
    ['lost-cities', 1, 'x', 'invalid anonId'],
    ['lost-cities', 2, 'anon-1234567', 'vote must be 0 or 1'],
  ])('refuses itemId %s, vote %s, anonId %s', async (itemId, v, anonId, message) => {
    const api = testApi();
    const res = await vote(api, itemId, v, anonId);
    expect(res.status).toBe(400);
    expect(res.errors[0].message).toBe(message);
    expect(api.redis.sadd).not.toHaveBeenCalled();
  });

  it('is limited per IP, before anything is read', async () => {
    const api = testApi((d) => ({ limiters: { ...d.limiters, votes: refusing() } }));
    expect((await vote(api, 'the-mind')).status).toBe(429);
    expect(api.redis.sadd).not.toHaveBeenCalled();
  });

  describe('accepts only known items', () => {
    const withStatus = (status: string) => {
      const api = testApi();
      api.redis.hashes['suggestions:sug-abc123'] = { status };
      return api;
    };

    it('answers 404 for an id on neither list and writes nothing', async () => {
      const api = testApi();
      for (const v of [1, 0]) {
        const res = await vote(api, 'made-up-game', v);
        expect(res.status).toBe(404);
        expect(res.errors[0]).toMatchObject({ message: 'unknown itemId', extensions: { code: 'NOT_FOUND' } });
      }
      // Not a suggestion's id either, so nothing is looked up.
      expect(api.redis.hget).not.toHaveBeenCalled();
      expect(api.redis.sadd).not.toHaveBeenCalled();
      expect(api.redis.srem).not.toHaveBeenCalled();
      expect(api.redis.scard).not.toHaveBeenCalled();
    });

    it('answers 404 for a suggestion id with no record', async () => {
      const api = testApi();
      expect((await vote(api, 'sug-made-up')).status).toBe(404);
      expect(api.redis.hget).toHaveBeenCalledWith('suggestions:sug-made-up', 'status');
      expect(api.redis.sadd).not.toHaveBeenCalled();
    });

    it.each(['active', 'approved', 'unsent'])(
      'answers 404 for %s, an id list rather than a suggestion, without reading it',
      async (id) => {
        const api = testApi();
        expect((await vote(api, id)).status).toBe(404);
        expect(api.redis.hget).not.toHaveBeenCalled();
      },
    );

    it('takes a compiled-in wishlist id without looking up a suggestion', async () => {
      const api = testApi();
      expect((await vote(api, 'the-mind')).status).toBe(200);
      expect(api.redis.hget).not.toHaveBeenCalled();
      expect(api.redis.sadd).toHaveBeenCalledWith('wishlist:votes:the-mind', 'anon-1234567');
    });

    it('takes an approved suggestion', async () => {
      const api = withStatus('approved');
      expect((await vote(api, 'sug-abc123')).status).toBe(200);
      expect(api.redis.sadd).toHaveBeenCalledWith('wishlist:votes:sug-abc123', 'anon-1234567');
    });

    it.each(['pending', 'unsent', 'denied', 'removed'])('refuses a %s suggestion', async (status) => {
      const api = withStatus(status);
      expect((await vote(api, 'sug-abc123')).status).toBe(404);
      expect(api.redis.sadd).not.toHaveBeenCalled();
    });
  });

  it('knows the same compiled-in wishlist ids as the client', () => {
    expect([...WISHLIST_IDS].sort()).toEqual(WISHLIST.map((w) => w.id).sort());
  });
});
