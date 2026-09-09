import { describe, it, expect, vi } from 'vitest';
import { handleAuth, type AuthDeps, type AuthRedis, type AuthResponse } from '../../api/auth';
import type { Mail } from '../../api/_lib/mail';

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { res.statusCode = code; return res as unknown as AuthResponse; },
    json(data: unknown) { res.body = data; return res as unknown as AuthResponse; },
    setHeader(name: string, value: string) { res.headers[name] = value; return res as unknown as AuthResponse; },
    send(body: string) { res.body = body; return res as unknown as AuthResponse; },
  };
  return res;
}

/** In-memory string keys with TTLs recorded, like the Upstash client's set/get/getdel/del. */
function makeRedis(seed: Record<string, string> = {}): AuthRedis & { store: Record<string, string>; ttl: Record<string, number> } {
  const store = { ...seed };
  const ttl: Record<string, number> = {};
  return {
    store,
    ttl,
    get: vi.fn(async (key: string) => store[key] ?? null),
    getdel: vi.fn(async (key: string) => { const v = store[key] ?? null; delete store[key]; return v; }),
    set: vi.fn(async (key: string, value: string, opts: { ex: number }) => { store[key] = value; ttl[key] = opts.ex; return 'OK'; }),
    del: vi.fn(async (key: string) => { const had = key in store ? 1 : 0; delete store[key]; return had; }),
  };
}

// Low-entropy on purpose so secret scanners don't mistake them for keys.
const TOKEN = 'test-token-' + 'a'.repeat(21);
const SID = 'test-session-' + 'b'.repeat(20);

function deps(over: Partial<AuthDeps> = {}): AuthDeps & { sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    redis: makeRedis(),
    mailer: { send: vi.fn(async (m: Mail) => { sent.push(m); }) },
    ownerEmail: 'Jess@Example.com',
    baseUrl: () => 'https://games.example',
    randomToken: () => TOKEN,
    sent,
    ...over,
  };
}

describe('handleAuth', () => {
  describe('asking for a link', () => {
    const ask = async (email: unknown, d = deps()) => {
      const res = makeRes();
      await handleAuth(d, { method: 'POST', query: {}, body: { email }, headers: {} }, res);
      return res;
    };

    it('emails the owner a single-use link that expires, and stores the token with that TTL', async () => {
      const d = deps();
      const res = await ask('  jess@example.com ', d);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(d.sent).toHaveLength(1);
      expect(d.sent[0].subject).toBe('Sign in to The Game Room');
      expect(d.sent[0].html).toContain(`https://games.example/api/auth?token=${TOKEN}`);
      const redis = d.redis as ReturnType<typeof makeRedis>;
      expect(redis.store[`auth:magic:${TOKEN}`]).toBe('1');
      expect(redis.ttl[`auth:magic:${TOKEN}`]).toBe(15 * 60);
    });

    it('answers the same for any other address, with the same Redis round trip, and sends nothing', async () => {
      const d = deps();
      const res = await ask('someone@else.com', d);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(d.sent).toHaveLength(0);
      const redis = d.redis as ReturnType<typeof makeRedis>;
      expect(redis.set).not.toHaveBeenCalled();
      expect(redis.get).toHaveBeenCalledTimes(1);
      expect(Object.keys(redis.store)).toEqual([]);
    });

    it('still answers 200 to the owner when the send fails, so the address cannot be read off the status', async () => {
      const d = deps({ mailer: { send: vi.fn(async () => { throw new Error('Resend responded 500'); }) } });
      const res = await ask('jess@example.com', d);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('rejects an unknown action instead of treating it as a link request', async () => {
      const d = deps();
      const res = makeRes();
      await handleAuth(d, { method: 'POST', query: {}, body: { action: 'x', email: 'jess@example.com' }, headers: {} }, res);
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'unknown action' });
      expect(d.sent).toHaveLength(0);
    });

    it('rejects a missing or malformed address', async () => {
      expect((await ask('')).statusCode).toBe(400);
      expect((await ask('not-an-email')).statusCode).toBe(400);
      expect((await ask(42)).statusCode).toBe(400);
      expect((await ask('a@' + 'b'.repeat(260))).statusCode).toBe(400);
    });

    it('is unavailable until email and the owner address are configured', async () => {
      expect((await ask('jess@example.com', deps({ mailer: null }))).statusCode).toBe(503);
      expect((await ask('jess@example.com', deps({ ownerEmail: null }))).statusCode).toBe(503);
    });
  });

  describe('the emailed link', () => {
    it('shows a confirmation form without consuming the token', async () => {
      const d = deps({ redis: makeRedis({ [`auth:magic:${TOKEN}`]: '1' }) });
      const res = makeRes();
      await handleAuth(d, { method: 'GET', query: { token: TOKEN }, headers: {} }, res);
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
      expect(String(res.body)).toContain('name="action" value="verify"');
      expect(String(res.body)).toContain(`name="token" value="${TOKEN}"`);
      expect((d.redis as ReturnType<typeof makeRedis>).store[`auth:magic:${TOKEN}`]).toBe('1');
    });

    it('says so when the token is gone, and rejects a malformed one', async () => {
      const res = makeRes();
      await handleAuth(deps(), { method: 'GET', query: { token: TOKEN }, headers: {} }, res);
      expect(String(res.body)).toContain('Link expired');
      const bad = makeRes();
      await handleAuth(deps(), { method: 'GET', query: { token: 'nope' }, headers: {} }, bad);
      expect(bad.statusCode).toBe(400);
    });
  });

  describe('confirming', () => {
    const verify = async (token: unknown, d = deps({ redis: makeRedis({ [`auth:magic:${TOKEN}`]: '1' }) })) => {
      const res = makeRes();
      await handleAuth(d, { method: 'POST', query: {}, body: { action: 'verify', token }, headers: {} }, res);
      return { res, redis: d.redis as ReturnType<typeof makeRedis> };
    };

    it('consumes the token, opens a 30-day session and sends the browser to the wishlist', async () => {
      const d = deps({ redis: makeRedis({ [`auth:magic:${TOKEN}`]: '1' }), randomToken: () => SID });
      const { res, redis } = await verify(TOKEN, d);
      expect(res.statusCode).toBe(303);
      expect(res.headers.Location).toBe('/?c=want');
      expect(res.headers['Set-Cookie']).toContain(`gr_session=${SID}; Max-Age=2592000`);
      expect(res.headers['Set-Cookie']).toContain('HttpOnly');
      expect(redis.store[`auth:magic:${TOKEN}`]).toBeUndefined();
      expect(redis.store[`auth:session:${SID}`]).toBe('1');
      expect(redis.ttl[`auth:session:${SID}`]).toBe(30 * 24 * 3600);
    });

    it('refuses a used, unknown or malformed token', async () => {
      const d = deps({ redis: makeRedis({ [`auth:magic:${TOKEN}`]: '1' }) });
      await verify(TOKEN, d);
      const { res } = await verify(TOKEN, d);
      expect(res.statusCode).toBe(403);
      expect(String(res.body)).toContain('Link expired');
      expect(res.headers['Set-Cookie']).toBeUndefined();
      expect((await verify('short')).res.statusCode).toBe(400);
    });
  });

  describe('the session', () => {
    it('reports admin only with a live session cookie', async () => {
      const d = deps({ redis: makeRedis({ [`auth:session:${SID}`]: '1' }) });
      const yes = makeRes();
      await handleAuth(d, { method: 'GET', query: {}, headers: { cookie: `gr_session=${SID}` } }, yes);
      expect(yes.body).toEqual({ admin: true });
      const no = makeRes();
      await handleAuth(d, { method: 'GET', query: {}, headers: { cookie: 'gr_session=' + 'c'.repeat(24) } }, no);
      expect(no.body).toEqual({ admin: false });
      const none = makeRes();
      await handleAuth(d, { method: 'GET', query: {}, headers: {} }, none);
      expect(none.body).toEqual({ admin: false });
    });

    it('logs out by deleting the session and clearing the cookie, JSON requests only', async () => {
      const d = deps({ redis: makeRedis({ [`auth:session:${SID}`]: '1' }) });
      const JSON_H = { 'content-type': 'application/json' };
      // A cross-site form post must not clear the cookie.
      const form = makeRes();
      await handleAuth(d, { method: 'POST', query: {}, body: { action: 'logout' }, headers: { 'content-type': 'application/x-www-form-urlencoded' } }, form);
      expect(form.statusCode).toBe(403);
      expect(form.headers['Set-Cookie']).toBeUndefined();
      expect((d.redis as ReturnType<typeof makeRedis>).store[`auth:session:${SID}`]).toBe('1');

      const res = makeRes();
      await handleAuth(d, { method: 'POST', query: {}, body: { action: 'logout' }, headers: { ...JSON_H, cookie: `gr_session=${SID}` } }, res);
      expect(res.body).toEqual({ ok: true });
      expect(res.headers['Set-Cookie']).toContain('gr_session=; Max-Age=0');
      expect((d.redis as ReturnType<typeof makeRedis>).store[`auth:session:${SID}`]).toBeUndefined();
      // Without a cookie it still clears, harmlessly.
      const bare = makeRes();
      await handleAuth(d, { method: 'POST', query: {}, body: { action: 'logout' }, headers: JSON_H }, bare);
      expect(bare.body).toEqual({ ok: true });
    });
  });

  it('returns 405 for other methods and 500 when Redis fails', async () => {
    const res = makeRes();
    await handleAuth(deps(), { method: 'PUT', query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(405);
    const broken = deps({ redis: { ...makeRedis(), get: vi.fn(async () => { throw new Error('down'); }) } });
    const err = makeRes();
    await handleAuth(broken, { method: 'GET', query: {}, headers: { cookie: `gr_session=${SID}` } }, err);
    expect(err.statusCode).toBe(500);
    // The link preview fails as JSON too, not as JSON labelled HTML.
    const preview = makeRes();
    await handleAuth(broken, { method: 'GET', query: { token: TOKEN }, headers: {} }, preview);
    expect(preview.statusCode).toBe(500);
    expect(preview.headers['Content-Type']).toBeUndefined();
  });
});
