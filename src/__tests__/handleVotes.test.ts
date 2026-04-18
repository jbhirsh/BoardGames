import { describe, it, expect, vi } from 'vitest';
import { handleVotes, type VotesRedis, type VotesRequest, type VotesResponse } from '../../api/votes';

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res as unknown as VotesResponse; },
    json(data: unknown) { res.body = data; return res as unknown as VotesResponse; },
  };
  return res;
}

function makeRedis(overrides: Partial<VotesRedis> = {}): VotesRedis {
  const pipeline = () => {
    const ops: Array<() => Promise<unknown>> = [];
    const api = {
      scard: vi.fn(() => { ops.push(() => Promise.resolve(0)); return api; }),
      sismember: vi.fn(() => { ops.push(() => Promise.resolve(0)); return api; }),
      exec: vi.fn(async () => Promise.all(ops.map((f) => f()))),
    };
    return api;
  };
  return {
    sadd: vi.fn(async () => 1),
    srem: vi.fn(async () => 1),
    scard: vi.fn(async () => 0),
    pipeline,
    ...overrides,
  };
}

describe('handleVotes', () => {
  it('returns 405 for unsupported method', async () => {
    const res = makeRes();
    await handleVotes(makeRedis(), { method: 'PATCH', query: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('GET returns 400 when no ids given', async () => {
    const res = makeRes();
    await handleVotes(makeRedis(), { method: 'GET', query: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('GET returns 400 for >100 ids', async () => {
    const res = makeRes();
    const ids = Array.from({ length: 101 }, (_, i) => `x${i}`).join(',');
    await handleVotes(makeRedis(), { method: 'GET', query: { ids } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('GET filters invalid ids and returns counts map', async () => {
    const redis = makeRedis({
      pipeline: () => {
        const calls: string[] = [];
        const api = {
          scard: vi.fn((key: string) => { calls.push(key); return api; }),
          sismember: vi.fn(() => api),
          exec: vi.fn(async () => calls.map((k) => (k.endsWith(':a') ? 3 : 5))),
        };
        return api;
      },
    });
    const req: VotesRequest = { method: 'GET', query: { ids: 'a,b,INVALID ID!,c' } };
    const res = makeRes();
    await handleVotes(redis, req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ counts: { a: 3, b: 5, c: 5 }, myVotes: [] });
  });

  it('GET returns myVotes when valid anonId is provided', async () => {
    const redis = makeRedis({
      pipeline: () => {
        const api = {
          scard: vi.fn(() => api),
          sismember: vi.fn(() => api),
          exec: vi.fn(async () => [2, 7, 1, 0]),
        };
        return api;
      },
    });
    const res = makeRes();
    await handleVotes(
      redis,
      { method: 'GET', query: { ids: 'a,b', anonId: 'anon-1234567' } },
      res,
    );
    expect(res.body).toEqual({ counts: { a: 2, b: 7 }, myVotes: ['a'] });
  });

  it('GET ignores malformed anonId', async () => {
    const redis = makeRedis({
      pipeline: () => {
        const api = {
          scard: vi.fn(() => api),
          sismember: vi.fn(() => api),
          exec: vi.fn(async () => [1]),
        };
        return api;
      },
    });
    const res = makeRes();
    await handleVotes(
      redis,
      { method: 'GET', query: { ids: 'a', anonId: 'bad id!' } },
      res,
    );
    expect(res.body).toEqual({ counts: { a: 1 }, myVotes: [] });
  });

  it('POST vote=1 calls sadd and returns new count', async () => {
    const redis = makeRedis({
      sadd: vi.fn(async () => 1),
      scard: vi.fn(async () => 4),
    });
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
    const redis = makeRedis({ srem: vi.fn(async () => 1), scard: vi.fn(async () => 2) });
    const res = makeRes();
    await handleVotes(
      redis,
      { method: 'POST', query: {}, body: { itemId: 'dominion', anonId: 'anon-1234567', vote: 0 } },
      res,
    );
    expect(redis.srem).toHaveBeenCalledWith('wishlist:votes:dominion', 'anon-1234567');
    expect(res.body).toEqual({ itemId: 'dominion', count: 2, myVote: 0 });
  });

  it('POST rejects invalid itemId', async () => {
    const res = makeRes();
    await handleVotes(
      makeRedis(),
      { method: 'POST', query: {}, body: { itemId: 'BadId!', anonId: 'anon-1234567', vote: 1 } },
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST rejects invalid anonId', async () => {
    const res = makeRes();
    await handleVotes(
      makeRedis(),
      { method: 'POST', query: {}, body: { itemId: 'lost-cities', anonId: 'x', vote: 1 } },
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST rejects non-0/1 vote value', async () => {
    const res = makeRes();
    await handleVotes(
      makeRedis(),
      { method: 'POST', query: {}, body: { itemId: 'lost-cities', anonId: 'anon-1234567', vote: 2 } },
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on redis error', async () => {
    const redis = makeRedis({
      pipeline: () => {
        const api = {
          scard: vi.fn(() => api),
          sismember: vi.fn(() => api),
          exec: vi.fn(async () => { throw new Error('redis down'); }),
        };
        return api;
      },
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await handleVotes(redis, { method: 'GET', query: { ids: 'a' } }, res);
    expect(res.statusCode).toBe(500);
    errSpy.mockRestore();
  });
});
