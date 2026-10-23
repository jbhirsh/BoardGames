import { vi } from 'vitest';

type Hashes = Record<string, Record<string, unknown>>;
type Lists = Record<string, string[]>;

export interface FakeRedisSeed {
  /** String keys, as SET writes them. */
  strings?: Record<string, string>;
  /** Hashes, each field as written (a number stays a number until read). */
  hashes?: Hashes;
  lists?: Lists;
  sets?: Record<string, string[]>;
  /**
   * Answer as the raw client (getRawRedis, automatic deserialisation off):
   * each value as Redis stores it, a string, and HGETALL a flat
   * [field, value, ...] list ([] for a missing key). Otherwise as the
   * default client: each value parsed back from JSON where it parses, and
   * HGETALL an object (null for a missing key).
   */
  raw?: boolean;
}

/** What a pipeline can queue: reads, answered together on exec. */
export interface FakePipeline {
  hgetall(key: string): FakePipeline;
  scard(key: string): FakePipeline;
  sismember(key: string, member: string): FakePipeline;
  exec(): Promise<unknown[]>;
}

/** What MULTI can queue: writes, run together on exec. */
export interface FakeTransaction {
  hset(key: string, fields: Record<string, string | number>): FakeTransaction;
  lpush(key: string, value: string): FakeTransaction;
  lrem(key: string, count: number, value: string): FakeTransaction;
  exec(): Promise<unknown[]>;
}

/**
 * An in-memory Redis behind the commands the API's handlers use, each a
 * spy, for the handlers' own small interfaces (AuthRedis, VotesRedis,
 * SuggestionsRedis). The keyspace is open for a test to read or change:
 * `strings` (with the `ttl` each SET gave), `hashes`, `lists` and `sets`.
 */
export function fakeRedis(seed: FakeRedisSeed = {}) {
  const strings: Record<string, string> = { ...seed.strings };
  const ttl: Record<string, number> = {};
  // Copied through JSON, which, as Redis, keeps no field that is undefined.
  const hashes: Hashes = JSON.parse(JSON.stringify(seed.hashes ?? {}));
  const lists: Lists = JSON.parse(JSON.stringify(seed.lists ?? {}));
  const sets: Record<string, Set<string>> = Object.fromEntries(
    Object.entries(seed.sets ?? {}).map(([key, members]) => [key, new Set(members)]),
  );
  const raw = seed.raw ?? false;

  /** A value as Redis holds it: strings as written, anything else as the client serialises it. */
  const stored = (value: unknown) => (typeof value === 'object' ? JSON.stringify(value) : String(value));
  const read = (value: string): unknown => {
    if (raw) return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };
  const hgetall = (key: string): unknown => {
    const fields = Object.entries(hashes[key] ?? {});
    if (raw) return fields.flatMap(([field, value]) => [field, stored(value)]);
    return fields.length ? Object.fromEntries(fields.map(([field, value]) => [field, read(stored(value))])) : null;
  };
  const scard = (key: string) => sets[key]?.size ?? 0;
  const sismember = (key: string, member: string) => (sets[key]?.has(member) ? 1 : 0);

  const redis = {
    strings,
    ttl,
    hashes,
    lists,
    sets,
    get: vi.fn(async (key: string) => (key in strings ? read(strings[key]) : null)),
    getdel: vi.fn(async (key: string) => {
      const value = key in strings ? read(strings[key]) : null;
      delete strings[key];
      delete ttl[key];
      return value;
    }),
    set: vi.fn(async (key: string, value: string, opts: { ex: number }) => {
      strings[key] = value;
      ttl[key] = opts.ex;
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      const had = key in strings || key in hashes || key in lists || key in sets;
      delete strings[key];
      delete ttl[key];
      delete hashes[key];
      delete lists[key];
      delete sets[key];
      return had ? 1 : 0;
    }),
    hset: vi.fn(async (key: string, fields: Record<string, string | number>) => {
      hashes[key] = { ...(hashes[key] ?? {}), ...fields };
      return Object.keys(fields).length;
    }),
    hget: vi.fn(async (key: string, field: string) => {
      const value = hashes[key]?.[field];
      return value === undefined ? null : read(stored(value));
    }),
    hgetall: vi.fn(async (key: string) => hgetall(key)),
    hsetnx: vi.fn(async (key: string, field: string, value: string | number) => {
      if (hashes[key]?.[field] !== undefined) return 0;
      hashes[key] = { ...(hashes[key] ?? {}), [field]: value };
      return 1;
    }),
    hdel: vi.fn(async (key: string, field: string) => {
      const had = hashes[key]?.[field] !== undefined;
      delete hashes[key]?.[field];
      return had ? 1 : 0;
    }),
    lpush: vi.fn(async (key: string, value: string) => {
      (lists[key] ??= []).unshift(value);
      return lists[key].length;
    }),
    lrem: vi.fn(async (key: string, _count: number, value: string) => {
      const before = (lists[key] ?? []).length;
      lists[key] = (lists[key] ?? []).filter((v) => v !== value);
      return before - lists[key].length;
    }),
    // Redis's indexes: stop is inclusive, and negative ones count from the end.
    lrange: vi.fn(async (key: string, start: number, stop: number) => {
      const list = lists[key] ?? [];
      const at = (i: number) => (i < 0 ? Math.max(0, list.length + i) : i);
      return list.slice(at(start), at(stop) + 1);
    }),
    sadd: vi.fn(async (key: string, member: string) => {
      const set = (sets[key] ??= new Set());
      const had = set.has(member);
      set.add(member);
      return had ? 0 : 1;
    }),
    srem: vi.fn(async (key: string, member: string) => (sets[key]?.delete(member) ? 1 : 0)),
    scard: vi.fn(async (key: string) => scard(key)),
    pipeline: (): FakePipeline => {
      const reads: Array<() => unknown> = [];
      const pipeline: FakePipeline = {
        hgetall: (key) => {
          reads.push(() => hgetall(key));
          return pipeline;
        },
        scard: (key) => {
          reads.push(() => scard(key));
          return pipeline;
        },
        sismember: (key, member) => {
          reads.push(() => sismember(key, member));
          return pipeline;
        },
        exec: async () => reads.map((r) => r()),
      };
      return pipeline;
    },
    // Queued writes run through the spies above, looked up when exec runs (so
    // assertions on them still see each one, and a test's replacement is
    // used), and all at once, with nothing interleaved, as MULTI/EXEC runs them.
    multi: vi.fn((): FakeTransaction => {
      const ops: Array<() => Promise<unknown>> = [];
      const tx: FakeTransaction = {
        hset: (key, fields) => {
          ops.push(() => redis.hset(key, fields));
          return tx;
        },
        lpush: (key, value) => {
          ops.push(() => redis.lpush(key, value));
          return tx;
        },
        lrem: (key, count, value) => {
          ops.push(() => redis.lrem(key, count, value));
          return tx;
        },
        exec: async () => Promise.all(ops.map((op) => op())),
      };
      return tx;
    }),
  };
  return redis;
}
