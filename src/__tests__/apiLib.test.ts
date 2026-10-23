import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseIds, optionalAnonId, ANON_RE, MAX_IDS } from '../../api/_lib/ids';
import { getRawRedis, getRedis, resetRedisForTests } from '../../api/_lib/redis';
import { NAME_RE as CLIENT_NAME_RE } from '../utils/displayName';

const errorOf = (v: unknown) => {
  const r = parseIds(v);
  return r.ok ? undefined : r.error;
};
const idsOf = (v: unknown) => {
  const r = parseIds(v);
  return r.ok ? r.ids : undefined;
};

describe('parseIds', () => {
  it('requires a non-empty string', () => {
    expect(errorOf(undefined)).toMatch(/required/);
    expect(errorOf('')).toMatch(/required/);
  });

  it('drops malformed slugs and errors when none remain', () => {
    expect(idsOf(' azul , Bad Slug ,catan')).toEqual(['azul', 'catan']);
    expect(errorOf('Bad!')).toMatch(/valid slug/);
  });

  it('caps the list', () => {
    const ids = Array.from({ length: MAX_IDS + 1 }, (_, i) => `g${i}`).join(',');
    expect(errorOf(ids)).toMatch(/too many/);
    expect(idsOf(Array.from({ length: MAX_IDS }, (_, i) => `g${i}`).join(','))).toHaveLength(MAX_IDS);
  });
});

describe('optionalAnonId', () => {
  it('returns the id only when it matches the anon shape', () => {
    expect(optionalAnonId('anon-12345678')).toBe('anon-12345678');
    expect(optionalAnonId('x')).toBeNull();
    expect(optionalAnonId(undefined)).toBeNull();
    expect(ANON_RE.test('a'.repeat(65))).toBe(false);
  });
});

describe('getRedis', () => {
  const env = { ...process.env };
  beforeEach(() => resetRedisForTests());
  afterEach(() => {
    process.env = { ...env };
    resetRedisForTests();
  });

  it('throws a clear error when the KV env vars are missing', () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    expect(() => getRedis()).toThrow(/KV_REST_API_URL and KV_REST_API_TOKEN/);
  });

  it('builds one client and reuses it', () => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'token';
    const a = getRedis();
    expect(getRedis()).toBe(a);
    const raw = getRawRedis();
    expect(getRawRedis()).toBe(raw);
    expect(raw).not.toBe(a);
  });

  it('hands hash values back as stored from the raw client only', async () => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'token';
    // Upstash's REST reply, base64-encoded as the client asks for it.
    const stored = ['game', 'null', 'alt', 'true', 'price', '1.50'];
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () => new Response(JSON.stringify({ result: stored.map((v) => Buffer.from(v).toString('base64')) })),
      );
    try {
      expect(await getRawRedis().hgetall('k')).toEqual(stored);
      expect(await getRedis().hgetall('k')).toEqual({ game: null, alt: true, price: '1.50' });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('display-name pattern', () => {
  it('matches the server pattern behaviour on representative names', () => {
    const ok = ['Jess', 'Mary-Kate', "O'Brien", 'J. R.', '2024', 'Zoë', 'x'.repeat(30)];
    const bad = ['', ' Jess', 'Jo & Bo', 'sam_1', '<b>', 'x'.repeat(31), 'O’Brien'];
    for (const n of ok) expect(CLIENT_NAME_RE.test(n), n).toBe(true);
    for (const n of bad) expect(CLIENT_NAME_RE.test(n), n).toBe(false);
  });
});
