import { describe, it, expect, vi } from 'vitest';
import { handleOwners, type OwnersRedis, type OwnersResponse } from '../../api/owners';

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res as unknown as OwnersResponse; },
    json(data: unknown) { res.body = data; return res as unknown as OwnersResponse; },
  };
  return res;
}

/** In-memory hash store so GET reflects what POST wrote. */
function makeRedis(seed: Record<string, Record<string, string>> = {}): OwnersRedis & { store: Record<string, Record<string, string>> } {
  const store: Record<string, Record<string, string>> = JSON.parse(JSON.stringify(seed));
  const redis = {
    store,
    hset: vi.fn(async (key: string, fields: Record<string, string>) => {
      store[key] = { ...(store[key] ?? {}), ...fields };
      return Object.keys(fields).length;
    }),
    hdel: vi.fn(async (key: string, field: string) => {
      if (store[key] && field in store[key]) { delete store[key][field]; return 1; }
      return 0;
    }),
    hgetall: vi.fn(async (key: string) => (store[key] && Object.keys(store[key]).length ? store[key] : null)),
    pipeline: () => {
      const keys: string[] = [];
      const api = {
        hgetall: vi.fn((key: string) => { keys.push(key); return api; }),
        exec: vi.fn(async () => keys.map((k) => (store[k] && Object.keys(store[k]).length ? store[k] : null))),
      };
      return api;
    },
  };
  return redis;
}

const ANON = 'anon-12345678';

describe('handleOwners', () => {
  it('returns 405 for unsupported methods', async () => {
    const res = makeRes();
    await handleOwners(makeRedis(), { method: 'DELETE', query: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('GET requires ids and rejects an empty or invalid list', async () => {
    let res = makeRes();
    await handleOwners(makeRedis(), { method: 'GET', query: {} }, res);
    expect(res.statusCode).toBe(400);
    res = makeRes();
    await handleOwners(makeRedis(), { method: 'GET', query: { ids: 'Bad Slug!' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('GET rejects more than 100 ids', async () => {
    const res = makeRes();
    const ids = Array.from({ length: 101 }, (_, i) => `g${i}`).join(',');
    await handleOwners(makeRedis(), { method: 'GET', query: { ids } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('GET returns sorted owner names per id and which ids are mine', async () => {
    const redis = makeRedis({ 'owners:azul': { [ANON]: 'Jess', 'anon-other000': 'Alex' } });
    const res = makeRes();
    await handleOwners(redis, { method: 'GET', query: { ids: 'azul,catan', anonId: ANON } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ owners: { azul: ['Alex', 'Jess'], catan: [] }, mine: ['azul'] });
  });

  it('GET restores names the Redis client JSON-parsed into numbers or null', async () => {
    // @upstash/redis deserialises hash values, so "2024" arrives as 2024 and "null" as null.
    const redis = makeRedis();
    redis.pipeline = () => {
      const api = {
        hgetall: vi.fn(() => api),
        exec: vi.fn(async () => [{ 'anon-a0000000': 2024, 'anon-b0000000': null, 'anon-c0000000': 'Jess' }]),
      };
      return api;
    };
    const res = makeRes();
    await handleOwners(redis, { method: 'GET', query: { ids: 'azul' } }, res);
    expect(res.body).toEqual({ owners: { azul: ['2024', 'Jess', 'null'] }, mine: [] });
  });

  it('GET without a valid anonId still returns owners but nothing mine', async () => {
    const redis = makeRedis({ 'owners:azul': { [ANON]: 'Jess' } });
    const res = makeRes();
    await handleOwners(redis, { method: 'GET', query: { ids: 'azul', anonId: 'x' } }, res);
    expect(res.body).toEqual({ owners: { azul: ['Jess'] }, mine: [] });
  });

  it('POST validates itemId, anonId, own and name', async () => {
    const bad = [
      { itemId: 'Bad!', anonId: ANON, name: 'Jess', own: 1 },
      { itemId: 'azul', anonId: 'x', name: 'Jess', own: 1 },
      { itemId: 'azul', anonId: ANON, name: 'Jess', own: 2 },
      { itemId: 'azul', anonId: ANON, name: '', own: 1 },
      { itemId: 'azul', anonId: ANON, name: '<script>', own: 1 },
      { itemId: 'azul', anonId: ANON, name: 'x'.repeat(31), own: 1 },
    ];
    for (const body of bad) {
      const res = makeRes();
      await handleOwners(makeRedis(), { method: 'POST', query: {}, body }, res);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
    }
  });

  it('POST own=1 records the trimmed name under the browser id and returns the owner list', async () => {
    const redis = makeRedis({ 'owners:azul': { 'anon-other000': 'Alex' } });
    const res = makeRes();
    await handleOwners(redis, { method: 'POST', query: {}, body: { itemId: 'azul', anonId: ANON, name: '  Jess ', own: 1 } }, res);
    expect(res.statusCode).toBe(200);
    expect(redis.hset).toHaveBeenCalledWith('owners:azul', { [ANON]: 'Jess' });
    expect(res.body).toEqual({ itemId: 'azul', owners: ['Alex', 'Jess'], mine: true });
  });

  it('POST own=0 removes the browser id and needs no name', async () => {
    const redis = makeRedis({ 'owners:azul': { [ANON]: 'Jess' } });
    const res = makeRes();
    await handleOwners(redis, { method: 'POST', query: {}, body: { itemId: 'azul', anonId: ANON, own: 0 } }, res);
    expect(res.statusCode).toBe(200);
    expect(redis.hdel).toHaveBeenCalledWith('owners:azul', ANON);
    expect(res.body).toEqual({ itemId: 'azul', owners: [], mine: false });
  });

  it('returns 500 when Redis throws', async () => {
    const redis = makeRedis();
    redis.hset = vi.fn(async () => { throw new Error('boom'); });
    const res = makeRes();
    await handleOwners(redis, { method: 'POST', query: {}, body: { itemId: 'azul', anonId: ANON, name: 'Jess', own: 1 } }, res);
    expect(res.statusCode).toBe(500);
  });
});
