// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { refusing, testApi, type TestApi } from './helpers/api';

// Low-entropy on purpose so secret scanners don't mistake them for keys.
const TOKEN = 'test-token-' + 'a'.repeat(21);
const SID = 'test-session-' + 'b'.repeat(20);

const ASK = 'mutation ($email: String!) { requestSignInLink(email: $email) }';
const LIVE = 'query ($token: String!) { signInLinkLive(token: $token) }';
const VERIFY = 'mutation ($token: String!) { verifySignIn(token: $token) { admin } }';
const SESSION = '{ session { admin } }';
const LOGOUT = 'mutation { logout }';

const withStrings = (strings: Record<string, string>, over?: Parameters<typeof testApi>[0]) => {
  const api = testApi(over);
  Object.assign(api.redis.strings, strings);
  return api;
};

const ask = async (email: string, api: TestApi = testApi()) => {
  const res = await api.run(ASK, { email });
  await Promise.all(api.deferred);
  return res;
};

describe('requestSignInLink', () => {
  it('emails the owner a single-use link to the confirm page, and stores the token with its TTL', async () => {
    const api = testApi();
    const res = await ask('  Jess@Example.com ', api);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ requestSignInLink: true });
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0].subject).toBe('Sign in to The Game Room');
    expect(api.sent[0].html).toContain(`https://games.example/sign-in/confirm?token=${TOKEN}`);
    expect(api.redis.strings[`auth:magic:${TOKEN}`]).toBe('1');
    expect(api.redis.ttl[`auth:magic:${TOKEN}`]).toBe(15 * 60);
  });

  it('sends the email after the answer, as work left running', async () => {
    const api = testApi();
    let release = () => {};
    const send = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    api.deps.auth.mailer = { send };
    const res = await api.run(ASK, { email: 'jess@example.com' });
    expect(res.data).toEqual({ requestSignInLink: true });
    expect(api.deferred).toHaveLength(1);
    release();
    await Promise.all(api.deferred);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('answers the same for any other address, with the same Redis round trip, and sends nothing', async () => {
    const api = testApi();
    const res = await ask('someone@else.com', api);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ requestSignInLink: true });
    expect(api.sent).toHaveLength(0);
    expect(api.deferred).toHaveLength(0);
    expect(api.redis.set).not.toHaveBeenCalled();
    expect(api.redis.get).toHaveBeenCalledTimes(1);
    expect(Object.keys(api.redis.strings)).toEqual([]);
  });

  it('still answers to the owner when the send fails, so the address cannot be read off the answer', async () => {
    const api = testApi((d) => ({
      auth: {
        ...d.auth,
        mailer: {
          send: vi.fn(async () => {
            throw new Error('Resend responded 500');
          }),
        },
      },
    }));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await ask('jess@example.com', api);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ requestSignInLink: true });
    expect(errSpy).toHaveBeenCalledWith('auth: could not send the sign-in link', expect.any(Error));
    errSpy.mockRestore();
  });

  it('rejects a missing or malformed address', async () => {
    for (const email of ['', 'not-an-email', 'a@' + 'b'.repeat(260)]) {
      const res = await ask(email);
      expect(res.status, email).toBe(400);
      expect(res.errors[0].message).toBe('enter an email address');
    }
  });

  it('is unavailable until email and the owner address are configured', async () => {
    for (const auth of [{ mailer: null }, { ownerEmail: null }]) {
      const res = await ask(
        'jess@example.com',
        testApi((d) => ({ auth: { ...d.auth, ...auth } })),
      );
      expect(res.status).toBe(503);
      expect(res.errors[0]).toMatchObject({
        message: 'Sign-in is not set up yet',
        extensions: { code: 'UNAVAILABLE' },
      });
    }
  });

  it('is limited per IP, before anything is stored', async () => {
    const api = testApi((d) => ({ limiters: { ...d.limiters, signInLink: refusing() } }));
    const res = await ask('jess@example.com', api);
    expect(res.status).toBe(429);
    expect(api.sent).toHaveLength(0);
    expect(api.redis.set).not.toHaveBeenCalled();
  });
});

describe('the emailed link', () => {
  it('reads whether the token is live without consuming it', async () => {
    const api = withStrings({ [`auth:magic:${TOKEN}`]: '1' });
    expect((await api.run(LIVE, { token: TOKEN })).data).toEqual({ signInLinkLive: true });
    expect(api.redis.strings[`auth:magic:${TOKEN}`]).toBe('1');
    expect((await testApi().run(LIVE, { token: TOKEN })).data).toEqual({ signInLinkLive: false });
  });

  it('rejects a malformed token', async () => {
    const res = await testApi().run(LIVE, { token: 'nope' });
    expect(res.status).toBe(400);
    expect(res.errors[0].message).toBe(
      'This sign-in link is incomplete or mistyped. Ask for a new one from the wishlist.',
    );
  });
});

describe('verifySignIn', () => {
  it('consumes the token and opens a 30-day session in an HttpOnly cookie', async () => {
    const api = withStrings({ [`auth:magic:${TOKEN}`]: '1' }, (d) => ({
      auth: { ...d.auth, randomToken: () => SID },
    }));
    const res = await api.run(VERIFY, { token: TOKEN });
    expect(res.data).toEqual({ verifySignIn: { admin: true } });
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain(`gr_session=${SID}; Max-Age=2592000`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(api.redis.strings[`auth:magic:${TOKEN}`]).toBeUndefined();
    expect(api.redis.strings[`auth:session:${SID}`]).toBe('1');
    expect(api.redis.ttl[`auth:session:${SID}`]).toBe(30 * 24 * 3600);
  });

  it('refuses a used or malformed token, setting no cookie', async () => {
    const api = withStrings({ [`auth:magic:${TOKEN}`]: '1' });
    await api.run(VERIFY, { token: TOKEN });
    const again = await api.run(VERIFY, { token: TOKEN });
    expect(again.status).toBe(403);
    expect(again.errors[0].message).toBe(
      'This sign-in link has expired or was already used. Ask for a new one from the wishlist.',
    );
    expect(again.headers.get('set-cookie')).toBeNull();
    const bad = await api.run(VERIFY, { token: 'short' });
    expect(bad.status).toBe(400);
    expect(bad.headers.get('set-cookie')).toBeNull();
  });
});

describe('the session', () => {
  it('reports admin only with a live session cookie', async () => {
    const api = withStrings({ [`auth:session:${SID}`]: '1' });
    expect((await api.run(SESSION, {}, { cookie: `gr_session=${SID}` })).data).toEqual({ session: { admin: true } });
    expect((await api.run(SESSION, {}, { cookie: 'gr_session=' + 'c'.repeat(24) })).data).toEqual({
      session: { admin: false },
    });
    expect((await api.run(SESSION)).data).toEqual({ session: { admin: false } });
  });

  it('logs out by deleting the session and clearing the cookie, even without one', async () => {
    const api = withStrings({ [`auth:session:${SID}`]: '1' });
    const res = await api.run(LOGOUT, {}, { cookie: `gr_session=${SID}` });
    expect(res.data).toEqual({ logout: true });
    expect(res.headers.get('set-cookie')).toContain('gr_session=; Max-Age=0');
    expect(api.redis.strings[`auth:session:${SID}`]).toBeUndefined();
    expect((await api.run(LOGOUT)).data).toEqual({ logout: true });
  });

  it('answers 500, reported, when Redis fails', async () => {
    const api = testApi();
    api.redis.get.mockRejectedValue(new Error('redis down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await api.run(SESSION, {}, { cookie: `gr_session=${SID}` });
    expect(res.status).toBe(500);
    expect(res.errors[0].message).toBe('Server error');
    expect(errSpy).toHaveBeenCalledWith('auth api error:', expect.any(Error));
    errSpy.mockRestore();
  });
});
