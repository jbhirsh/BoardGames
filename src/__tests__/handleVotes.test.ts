import { describe, it, expect, vi } from 'vitest';
import { handleVotes, type VotesPipeline, type VotesRedis, type VotesRequest, type VotesResponse } from '../../api/votes';
import { WISHLIST_IDS } from '../../api/_lib/wishlistIds';
import { WISHLIST } from '../data/wishlist';
import { fakeRedis } from './helpers/fakeRedis';

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res as unknown as VotesResponse; },
    json(data: unknown) { res.body = data; return res as unknown as VotesResponse; },
  };
  return res;
}

/** `n` voters other than the one asking. */
const voters = (n: number) => Array.from({ length: n }, (_, i) => `anon-other-${i}`);

describe('handleVotes', () => {
  it('returns 405 for unsupported method', async () => {
    const res = makeRes();
    await handleVotes(fakeRedis(), { method: 'PATCH', query: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('GET returns 400 when no ids given', async () => {
    const res = makeRes();
    await handleVotes(fakeRedis(), { method: 'GET', query: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('GET returns 400 for >100 ids', async () => {
    const res = makeRes();
    const ids = Array.from({ length: 101 }, (_, i) => `x${i}`).join(',');
    await handleVotes(fakeRedis(), { method: 'GET', query: { ids } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('GET accepts exactly 100 ids (the cap is inclusive)', async () => {
    // Boundary: only >100 is rejected. Pins `ids.length > 100` so it can't be
    // weakened to `>= 100`, which would reject a legitimate 100-id request.
    const res = makeRes();
    const ids = Array.from({ length: 100 }, (_, i) => `g${i}`).join(',');
    await handleVotes(fakeRedis(), { method: 'GET', query: { ids } }, res);
    expect(res.statusCode).toBe(200);
  });

  it('GET filters invalid ids and returns counts map', async () => {
    const redis = fakeRedis({ sets: {
      'wishlist:votes:a': voters(3),
      'wishlist:votes:b': voters(5),
      'wishlist:votes:c': voters(5),
    } });
    const req: VotesRequest = { method: 'GET', query: { ids: 'a,b,INVALID ID!,c' } };
    const res = makeRes();
    await handleVotes(redis, req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ counts: { a: 3, b: 5, c: 5 }, myVotes: [] });
  });

  it('GET returns myVotes when valid anonId is provided', async () => {
    const redis = fakeRedis({ sets: {
      'wishlist:votes:a': ['anon-1234567', ...voters(1)],
      'wishlist:votes:b': voters(7),
    } });
    const res = makeRes();
    await handleVotes(
      redis,
      { method: 'GET', query: { ids: 'a,b', anonId: 'anon-1234567' } },
      res,
    );
    expect(res.body).toEqual({ counts: { a: 2, b: 7 }, myVotes: ['a'] });
  });

  it('GET ignores malformed anonId', async () => {
    const redis = fakeRedis({ sets: { 'wishlist:votes:a': voters(1) } });
    const res = makeRes();
    await handleVotes(
      redis,
      { method: 'GET', query: { ids: 'a', anonId: 'bad id!' } },
      res,
    );
    expect(res.body).toEqual({ counts: { a: 1 }, myVotes: [] });
  });

  it('POST vote=1 calls sadd and returns new count', async () => {
    const redis = fakeRedis({ sets: { 'wishlist:votes:lost-cities': voters(3) } });
    const res = makeRes();
    await handleVotes(
      redis,
      { method: 'POST', query: {}, body: { itemId: 'lost-cities', anonId: 'anon-1234567', vote: 1 } },
      res,
    );
    expect(redis.sadd).toHaveBeenCalledWith('wishlist:votes:lost-cities', 'anon-1234567');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ itemId: 'lost-cities', count: 4, myVote: 1 });
  });

  it('POST vote=0 calls srem', async () => {
    const redis = fakeRedis({ sets: { 'wishlist:votes:dominion-seaside': ['anon-1234567', ...voters(2)] } });
    const res = makeRes();
    await handleVotes(
      redis,
      { method: 'POST', query: {}, body: { itemId: 'dominion-seaside', anonId: 'anon-1234567', vote: 0 } },
      res,
    );
    expect(redis.srem).toHaveBeenCalledWith('wishlist:votes:dominion-seaside', 'anon-1234567');
    expect(res.body).toEqual({ itemId: 'dominion-seaside', count: 2, myVote: 0 });
  });

  describe('POST accepts only known items', () => {
    const vote = (redis: VotesRedis, itemId: string, v: 0 | 1 = 1) => {
      const res = makeRes();
      return handleVotes(redis, { method: 'POST', query: {}, body: { itemId, anonId: 'anon-1234567', vote: v } }, res).then(() => res);
    };
    const withStatus = (status: string) => fakeRedis({ hashes: { 'suggestions:sug-abc123': { status } } });

    it('answers 404 for an id on neither list and writes nothing', async () => {
      const redis = fakeRedis();
      for (const v of [1, 0] as const) {
        const res = await vote(redis, 'made-up-game', v);
        expect(res.statusCode).toBe(404);
        expect(res.body).toEqual({ error: 'unknown itemId' });
      }
      // Not a suggestion's id either, so nothing is looked up.
      expect(redis.hget).not.toHaveBeenCalled();
      expect(redis.sadd).not.toHaveBeenCalled();
      expect(redis.srem).not.toHaveBeenCalled();
      expect(redis.scard).not.toHaveBeenCalled();
    });

    it('answers 404 for a suggestion id with no record', async () => {
      const redis = fakeRedis();
      const res = await vote(redis, 'sug-made-up');
      expect(res.statusCode).toBe(404);
      expect(redis.hget).toHaveBeenCalledWith('suggestions:sug-made-up', 'status');
      expect(redis.sadd).not.toHaveBeenCalled();
    });

    it.each(['active', 'approved', 'unsent'])('answers 404 for %s, an id list rather than a suggestion, without reading it', async (id) => {
      const redis = fakeRedis();
      const res = await vote(redis, id);
      expect(res.statusCode).toBe(404);
      expect(redis.hget).not.toHaveBeenCalled();
    });

    it('takes a compiled-in wishlist id without looking up a suggestion', async () => {
      const redis = fakeRedis();
      const res = await vote(redis, 'the-mind');
      expect(res.statusCode).toBe(200);
      expect(redis.hget).not.toHaveBeenCalled();
      expect(redis.sadd).toHaveBeenCalledWith('wishlist:votes:the-mind', 'anon-1234567');
    });

    it('takes an approved suggestion', async () => {
      const redis = withStatus('approved');
      const res = await vote(redis, 'sug-abc123');
      expect(res.statusCode).toBe(200);
      expect(redis.sadd).toHaveBeenCalledWith('wishlist:votes:sug-abc123', 'anon-1234567');
    });

    it.each(['pending', 'unsent', 'denied', 'removed'])('refuses a %s suggestion', async (status) => {
      const redis = withStatus(status);
      const res = await vote(redis, 'sug-abc123');
      expect(res.statusCode).toBe(404);
      expect(redis.sadd).not.toHaveBeenCalled();
    });
  });

  it('knows the same compiled-in wishlist ids as the client', () => {
    expect([...WISHLIST_IDS].sort()).toEqual(WISHLIST.map((w) => w.id).sort());
  });

  it('POST rejects invalid itemId', async () => {
    const res = makeRes();
    await handleVotes(
      fakeRedis(),
      { method: 'POST', query: {}, body: { itemId: 'BadId!', anonId: 'anon-1234567', vote: 1 } },
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST rejects invalid anonId', async () => {
    const res = makeRes();
    await handleVotes(
      fakeRedis(),
      { method: 'POST', query: {}, body: { itemId: 'lost-cities', anonId: 'x', vote: 1 } },
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST rejects non-0/1 vote value', async () => {
    const res = makeRes();
    await handleVotes(
      fakeRedis(),
      { method: 'POST', query: {}, body: { itemId: 'lost-cities', anonId: 'anon-1234567', vote: 2 } },
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on redis error', async () => {
    const broken: VotesPipeline = { scard: () => broken, sismember: () => broken, exec: async () => { throw new Error('redis down'); } };
    const redis: VotesRedis = { ...fakeRedis(), pipeline: () => broken };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await handleVotes(redis, { method: 'GET', query: { ids: 'a' } }, res);
    expect(res.statusCode).toBe(500);
    errSpy.mockRestore();
  });
});
