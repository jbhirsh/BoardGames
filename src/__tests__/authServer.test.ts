// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { APIError } from 'better-auth/api';
import {
  PRODUCTION_ORIGIN,
  allowedRoute,
  auth as deployedAuth,
  authLog,
  reportAuthError,
  authOrigin,
  hasSessionCookie,
  makeAuth,
  ownerSessionReader,
  trustedOrigins,
  type Auth,
  type Env,
} from '../../api/_auth';
import { authPasskey, authSession, authUser } from '../../api/_db/schema';
import { testDb, type TestDb } from './helpers/testDb';

// Better Auth in process (api/_auth.ts) against a migrated database: the
// tables the committed migrations build are the ones it writes, every flow
// the app uses works through them, and the owner check reads its sessions.
// Google's token endpoint is faked; WebAuthn's verification is mocked.

const webauthn = vi.hoisted(() => ({
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

vi.mock('@simplewebauthn/server', async (importActual) => ({
  ...(await importActual<typeof import('@simplewebauthn/server')>()),
  verifyRegistrationResponse: webauthn.verifyRegistrationResponse,
  verifyAuthenticationResponse: webauthn.verifyAuthenticationResponse,
}));

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('@sentry/node', () => ({ captureException: sentry.captureException, flush: vi.fn(async () => true) }));

const OWNER = 'jess@example.com';
const SECRETS = {
  BETTER_AUTH_SECRET: 'test-better-auth-secret-0123456789abcdef',
  GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  OAUTH_PROXY_SECRET: 'test-proxy-secret-0123456789abcdef',
};
const PRODUCTION: Env = { ...SECRETS, VERCEL_ENV: 'production', GOOGLE_CLIENT_SECRET: 'real-google-secret' };
const PREVIEW_HOST = 'board-games-git-branch-jbhirsh.vercel.app';
const PREVIEW: Env = {
  ...SECRETS,
  VERCEL_ENV: 'preview',
  VERCEL_BRANCH_URL: PREVIEW_HOST,
  VERCEL_URL: 'board-games-abc123.vercel.app',
};
const PREVIEW_ORIGIN = `https://${PREVIEW_HOST}`;

let dbs: TestDb[] = [];
afterEach(() => {
  for (const db of dbs) db.close();
  dbs = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  webauthn.verifyRegistrationResponse.mockReset();
  webauthn.verifyAuthenticationResponse.mockReset();
  sentry.captureException.mockReset();
  // Better Auth's log reports its errors through reportError, which writes them out too.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/** A deployment's Better Auth over a fresh, migrated database. */
async function deployment(env: Env) {
  const db = await testDb();
  dbs.push(db);
  // The database's own environment record isn't Better Auth's concern
  // (api/_db/client.ts checks it); here it is just the migrated tables.
  return { auth: makeAuth(env, db.db), db, path: db.path };
}

/** A browser: the cookies its answers set, sent back on each request. */
function browser(origin: string) {
  const jar = new Map<string, string>();
  const keep = (res: Response) => {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (/max-age=0/i.test(line) || value === '') jar.delete(name);
      else jar.set(name, value);
    }
    return res;
  };
  return {
    origin,
    jar,
    cookie: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    /** Sends `path` to `auth`, from this browser's own pages. */
    async send(auth: Auth, path: string, init: { method?: string; body?: unknown; base?: string } = {}) {
      const headers = new Headers({ origin, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') });
      if (init.body !== undefined) headers.set('content-type', 'application/json');
      const res = await auth.handler(
        new Request(`${init.base ?? origin}/api/auth${path}`, {
          method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        }),
      );
      return keep(res);
    },
  };
}

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** Google's token endpoint, answering any code with an ID token for `profile`. */
function fakeGoogle(profile: { email: string; email_verified?: boolean; sub?: string; name?: string }) {
  const seen: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      seen.push(url);
      if (url !== 'https://oauth2.googleapis.com/token') throw new Error(`unexpected fetch ${url}`);
      const body = String(init?.body ?? (input instanceof Request ? await input.text() : ''));
      const idToken = [
        b64({ alg: 'RS256', typ: 'JWT' }),
        b64({
          iss: 'https://accounts.google.com',
          aud: SECRETS.GOOGLE_CLIENT_ID,
          sub: profile.sub ?? `google-${profile.email}`,
          email: profile.email,
          email_verified: profile.email_verified ?? true,
          name: profile.name ?? 'Jess',
          picture: 'https://lh3.googleusercontent.com/a/photo',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
        'signature',
      ].join('.');
      return Response.json({
        access_token: 'google-access-token',
        id_token: idToken,
        expires_in: 3599,
        token_type: 'Bearer',
        scope: 'openid email profile',
        code_seen: body.includes('code=the-code'),
      });
    }),
  );
  return seen;
}

/** Starts a Google sign-in from /sign-in, answering Google's sign-in page's address. */
async function startGoogle(auth: Auth, page: ReturnType<typeof browser>) {
  const res = await page.send(auth, '/sign-in/social', {
    body: { provider: 'google', callbackURL: `${page.origin}/sign-in`, errorCallbackURL: `${page.origin}/sign-in` },
  });
  expect(res.status).toBe(200);
  const { url } = (await res.json()) as { url: string };
  return new URL(url);
}

/** A Google sign-in on production, start to finish: the browser holds the session after. */
async function signInOnProduction(auth: Auth, email: string, extra: { email_verified?: boolean } = {}) {
  const page = browser(PRODUCTION_ORIGIN);
  fakeGoogle({ email, ...extra });
  const google = await startGoogle(auth, page);
  const back = await page.send(
    auth,
    `/callback/google?code=the-code&state=${encodeURIComponent(google.searchParams.get('state') ?? '')}`,
  );
  return { page, back };
}

const readOwner = (auth: Auth, owner: string | null = OWNER) =>
  ownerSessionReader(
    async () => auth,
    () => owner,
  );

describe('a Google sign-in on production', () => {
  it('asks Google to choose an account and to call back to production', async () => {
    const { auth } = await deployment(PRODUCTION);
    const google = await startGoogle(auth, browser(PRODUCTION_ORIGIN));
    expect(google.origin).toBe('https://accounts.google.com');
    expect(google.searchParams.get('prompt')).toBe('select_account');
    expect(google.searchParams.get('redirect_uri')).toBe(`${PRODUCTION_ORIGIN}/api/auth/callback/google`);
    expect(google.searchParams.get('client_id')).toBe(SECRETS.GOOGLE_CLIENT_ID);
  });

  it("makes the owner's session, which the owner check reads as the owner's", async () => {
    const { auth, db } = await deployment(PRODUCTION);
    const { page, back } = await signInOnProduction(auth, 'Jess@Example.com');
    expect(back.status).toBe(302);
    expect(back.headers.get('location')).toBe(`${PRODUCTION_ORIGIN}/sign-in`);
    expect(page.cookie()).toMatch(/__Secure-better-auth\.session_token=/);
    expect(await readOwner(auth)({ cookie: page.cookie() })).toEqual({ owner: true });
    const [user] = await db.db.select().from(authUser);
    expect(user).toMatchObject({ email: 'jess@example.com', emailVerified: true, name: 'Jess' });
  });

  it("signs another Google account in, whose session isn't the owner's", async () => {
    const { auth } = await deployment(PRODUCTION);
    const { page } = await signInOnProduction(auth, 'sam.rivera@gmail.com');
    expect(await readOwner(auth)({ cookie: page.cookie() })).toEqual({ owner: false });
    const session = await auth.api.getSession({ headers: new Headers({ cookie: page.cookie() }) });
    expect(session?.user.email).toBe('sam.rivera@gmail.com');
  });

  it("isn't the owner with the owner's email unverified, or with no owner set", async () => {
    const { auth } = await deployment(PRODUCTION);
    const { page } = await signInOnProduction(auth, OWNER, { email_verified: false });
    expect(await readOwner(auth)({ cookie: page.cookie() })).toEqual({ owner: false });
    const verified = await deployment(PRODUCTION);
    const signedIn = await signInOnProduction(verified.auth, OWNER);
    expect(await readOwner(verified.auth, null)({ cookie: signedIn.page.cookie() })).toEqual({ owner: false });
  });

  it("lands an error from Google on the app's page", async () => {
    const { auth } = await deployment(PRODUCTION);
    const page = browser(PRODUCTION_ORIGIN);
    const google = await startGoogle(auth, page);
    const state = encodeURIComponent(google.searchParams.get('state') ?? '');
    const back = await page.send(auth, `/callback/google?error=access_denied&state=${state}`);
    expect(back.status).toBe(302);
    expect(back.headers.get('location')).toBe(`${PRODUCTION_ORIGIN}/sign-in?error=access_denied`);
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports a failure Google's callback only turns into an error code", async () => {
    const { auth } = await deployment(PRODUCTION);
    const page = browser(PRODUCTION_ORIGIN);
    const google = await startGoogle(auth, page);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'invalid_grant' }, { status: 400 })),
    );
    const state = encodeURIComponent(google.searchParams.get('state') ?? '');
    const back = await page.send(auth, `/callback/google?code=stale&state=${state}`);
    expect(back.headers.get('location')).toBe(`${PRODUCTION_ORIGIN}/sign-in?error=invalid_code`);
    expect(sentry.captureException).toHaveBeenCalled();
  });

  it('takes no Google ID token, only the redirect', async () => {
    const { auth } = await deployment(PRODUCTION);
    const res = await browser(PRODUCTION_ORIGIN).send(auth, '/sign-in/social', {
      body: { provider: 'google', idToken: { token: 'a.b.c' } },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'ID_TOKEN_NOT_SUPPORTED' });
  });
});

describe("a preview's Google sign-in, through production", () => {
  it('completes on the preview, with Google calling back to production alone', async () => {
    const production = await deployment(PRODUCTION);
    const preview = await deployment(PREVIEW);
    const page = browser(PREVIEW_ORIGIN);
    fakeGoogle({ email: OWNER });
    const google = await startGoogle(preview.auth, page);
    expect(google.searchParams.get('redirect_uri')).toBe(`${PRODUCTION_ORIGIN}/api/auth/callback/google`);

    // Google sends the browser to production, which exchanges the code and
    // hands the preview the profile, encrypted.
    const state = encodeURIComponent(google.searchParams.get('state') ?? '');
    const atProduction = await browser(PRODUCTION_ORIGIN).send(
      production.auth,
      `/callback/google?code=the-code&state=${state}`,
    );
    expect(atProduction.status).toBe(302);
    const toPreview = new URL(atProduction.headers.get('location') ?? '');
    expect(toPreview.origin).toBe(PREVIEW_ORIGIN);
    expect(toPreview.pathname).toBe('/api/auth/callback/google/oauth-proxy');
    // Production made no account or session of its own.
    expect(await production.db.db.select().from(authUser)).toEqual([]);

    const done = await page.send(preview.auth, `${toPreview.pathname.replace('/api/auth', '')}${toPreview.search}`);
    expect(done.status).toBe(302);
    expect(done.headers.get('location')).toBe(`${PREVIEW_ORIGIN}/sign-in`);
    expect(await readOwner(preview.auth)({ cookie: page.cookie() })).toEqual({ owner: true });
  });

  it('lands a failure from Google on the preview that started it', async () => {
    const production = await deployment(PRODUCTION);
    const preview = await deployment(PREVIEW);
    const google = await startGoogle(preview.auth, browser(PREVIEW_ORIGIN));
    const state = encodeURIComponent(google.searchParams.get('state') ?? '');
    const atProduction = await browser(PRODUCTION_ORIGIN).send(
      production.auth,
      `/callback/google?error=access_denied&state=${state}`,
    );
    expect(atProduction.status).toBe(302);
    expect(atProduction.headers.get('location')).toBe(`${PREVIEW_ORIGIN}/sign-in?error=access_denied`);
  });

  it("is refused production's completion route, which only a preview answers", async () => {
    const production = await deployment(PRODUCTION);
    const page = browser(PRODUCTION_ORIGIN);
    for (const path of [
      '/callback/google/oauth-proxy?callbackURL=%2F&profile=x',
      '/oauth-proxy-callback?callbackURL=%2F',
    ]) {
      const res = await page.send(production.auth, path);
      expect(res.status, path).toBe(404);
    }
  });
});

describe('sessions', () => {
  it('renew past a day, in the database and in the cookie the owner check hands back', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const { auth, db } = await deployment(PRODUCTION);
    const { page } = await signInOnProduction(auth, OWNER);
    const [before] = await db.db.select().from(authSession);
    // Within the day nothing changes, and no cookie goes out.
    vi.setSystemTime(new Date('2026-11-01T20:00:00Z'));
    expect(await readOwner(auth)({ cookie: page.cookie() })).toEqual({ owner: true });

    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    const read = await readOwner(auth)({ cookie: page.cookie() });
    expect(read.owner).toBe(true);
    const renewed = read.setCookies?.find((line) => line.startsWith('__Secure-better-auth.session_token='));
    expect(renewed).toMatch(/Max-Age=2592000/);
    expect(renewed).toMatch(/HttpOnly/);
    expect(renewed).toMatch(/SameSite=Lax/);
    const [after] = await db.db.select().from(authSession);
    expect(after.expiresAt.getTime()).toBe(new Date('2026-12-03T12:00:00Z').getTime());
    expect(after.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime());
  });

  it("aren't the owner's once expired", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const { auth } = await deployment(PRODUCTION);
    const { page } = await signInOnProduction(auth, OWNER);
    vi.setSystemTime(new Date('2026-12-02T12:00:00Z'));
    expect((await readOwner(auth)({ cookie: page.cookie() })).owner).toBe(false);
  });

  it('end at sign-out, on the server', async () => {
    const { auth, db } = await deployment(PRODUCTION);
    const { page } = await signInOnProduction(auth, OWNER);
    const cookie = page.cookie();
    const out = await page.send(auth, '/sign-out', { body: {} });
    expect(out.status).toBe(200);
    expect(await db.db.select().from(authSession)).toEqual([]);
    // A stale cookie is cleared as it's read.
    const read = await readOwner(auth)({ cookie });
    expect(read.owner).toBe(false);
    expect(read.setCookies).toContain(
      '__Secure-better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
  });

  it('refuse a sign-out posted from another site', async () => {
    const { auth, db } = await deployment(PRODUCTION);
    const { page } = await signInOnProduction(auth, OWNER);
    const res = await auth.handler(
      new Request(`${PRODUCTION_ORIGIN}/api/auth/sign-out`, {
        method: 'POST',
        headers: { origin: 'https://evil.example', cookie: page.cookie(), 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(403);
    expect(await db.db.select().from(authSession)).toHaveLength(1);
  });
});

describe('the owner check', () => {
  it("doesn't build Better Auth for a request with no session cookie", async () => {
    const getAuth = vi.fn(async (): Promise<Auth> => {
      throw new Error('not wanted');
    });
    expect(await ownerSessionReader(getAuth, () => OWNER)({ cookie: 'theme=dark' })).toEqual({ owner: false });
    expect(await ownerSessionReader(getAuth, () => OWNER)({})).toEqual({ owner: false });
    expect(getAuth).not.toHaveBeenCalled();
  });

  it("reports a session it can't read, and counts it signed out", async () => {
    const getAuth = vi.fn(async (): Promise<Auth> => {
      throw new Error('BETTER_AUTH_SECRET not set');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const read = await ownerSessionReader(getAuth, () => OWNER)({ cookie: 'better-auth.session_token=x.y' });
    expect(read).toEqual({ owner: false });
    expect(sentry.captureException).toHaveBeenCalledWith(new Error('BETTER_AUTH_SECRET not set'));
  });

  it('knows the cookie under either of its names, and nothing like it', () => {
    expect(hasSessionCookie('better-auth.session_token=a')).toBe(true);
    expect(hasSessionCookie('x=1; __Secure-better-auth.session_token=a')).toBe(true);
    expect(hasSessionCookie(['x=1', '__Secure-better-auth.session_token=a'])).toBe(true);
    expect(hasSessionCookie('my-better-auth.session_token=a')).toBe(false);
    expect(hasSessionCookie('better-auth.session_data=a')).toBe(false);
    expect(hasSessionCookie(undefined)).toBe(false);
  });
});

/** A passkey's credential, as the mocked verification reports it. */
const CREDENTIAL = { id: 'credential-1', publicKey: new Uint8Array([1, 2, 3]), counter: 0 };

describe('passkeys', () => {
  async function ownerWithPasskey() {
    const deployed = await deployment(PRODUCTION);
    const { page } = await signInOnProduction(deployed.auth, OWNER);
    const options = await page.send(deployed.auth, '/passkey/generate-register-options');
    expect(options.status).toBe(200);
    expect(((await options.json()) as { rp: { id: string } }).rp.id).toBe('board-games-silk.vercel.app');
    webauthn.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        aaguid: '00000000-0000-0000-0000-000000000000',
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
        credential: CREDENTIAL,
      },
    });
    const added = await page.send(deployed.auth, '/passkey/verify-registration', {
      body: { response: { id: CREDENTIAL.id, response: { clientDataJSON: '', transports: ['internal'] } } },
    });
    expect(added.status, await added.clone().text()).toBe(200);
    return { ...deployed, page };
  }

  it('adds one for a fresh session, and signs in with it with no Google step', async () => {
    const { auth, db } = await ownerWithPasskey();
    const [stored] = await db.db.select().from(authPasskey);
    expect(stored).toMatchObject({
      credentialID: CREDENTIAL.id,
      backedUp: true,
      deviceType: 'multiDevice',
      transports: 'internal',
    });

    const later = browser(PRODUCTION_ORIGIN);
    const options = await later.send(auth, '/passkey/generate-authenticate-options');
    expect(options.status).toBe(200);
    webauthn.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } });
    const signedIn = await later.send(auth, '/passkey/verify-authentication', {
      body: { response: { id: CREDENTIAL.id, response: { clientDataJSON: '' } } },
    });
    expect(signedIn.status).toBe(200);
    expect(await readOwner(auth)({ cookie: later.cookie() })).toEqual({ owner: true });
    expect((await db.db.select().from(authPasskey).where(eq(authPasskey.id, stored.id)))[0].counter).toBe(1);
  });

  it('asks for a fresh sign-in to add one on a session over a day old', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const { auth } = await deployment(PRODUCTION);
    const { page } = await signInOnProduction(auth, OWNER);
    vi.setSystemTime(new Date('2026-11-02T13:00:00Z'));
    const res = await page.send(auth, '/passkey/generate-register-options');
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'SESSION_NOT_FRESH' });
  });

  it("won't sign in with a passkey nobody added", async () => {
    const { auth } = await deployment(PRODUCTION);
    const page = browser(PRODUCTION_ORIGIN);
    await page.send(auth, '/passkey/generate-authenticate-options');
    const res = await page.send(auth, '/passkey/verify-authentication', {
      body: { response: { id: 'nobody', response: { clientDataJSON: '' } } },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'PASSKEY_NOT_FOUND' });
  });
});

describe('the routes', () => {
  it("answer only the app's, and 404 the rest", async () => {
    const { auth } = await deployment(PRODUCTION);
    const page = browser(PRODUCTION_ORIGIN);
    expect((await page.send(auth, '/ok')).status).toBe(200);
    expect((await page.send(auth, '/get-session')).status).toBe(200);
    for (const [path, body] of [
      ['/sign-up/email', { email: 'a@b.c', password: 'password1234', name: 'A' }],
      ['/sign-in/email', { email: 'a@b.c', password: 'password1234' }],
      ['/update-user', { name: 'Someone' }],
      ['/delete-user', {}],
      ['/passkey/delete-passkey', { id: 'x' }],
      ['/link-social', { provider: 'google' }],
    ] as const) {
      expect((await page.send(auth, path, { body })).status, path).toBe(404);
    }
    for (const path of ['/list-sessions', '/passkey/list-user-passkeys', '/list-accounts', '/no-such-route']) {
      expect((await page.send(auth, path)).status, path).toBe(404);
    }
  });

  it('allow the proxy completion on a preview alone, and its old route nowhere', () => {
    expect(allowedRoute('/callback/:id/oauth-proxy', PREVIEW)).toBe(true);
    expect(allowedRoute('/callback/:id/oauth-proxy', PRODUCTION)).toBe(false);
    expect(allowedRoute('/oauth-proxy-callback', PREVIEW)).toBe(false);
    expect(allowedRoute(undefined, PREVIEW)).toBe(false);
  });
});

describe("each deployment's origins", () => {
  it('binds production to its address, a preview to its branch, and a test to the dev server', () => {
    expect(authOrigin(PRODUCTION)).toBe(PRODUCTION_ORIGIN);
    expect(trustedOrigins(PRODUCTION)).toEqual([PRODUCTION_ORIGIN]);
    expect(authOrigin(PREVIEW)).toBe(PREVIEW_ORIGIN);
    expect(trustedOrigins(PREVIEW)).toEqual([PREVIEW_ORIGIN, 'https://board-games-abc123.vercel.app']);
    expect(trustedOrigins({ ...PREVIEW, VERCEL_URL: undefined })).toEqual([PREVIEW_ORIGIN]);
    expect(authOrigin({})).toBe('http://localhost:5173');
    expect(trustedOrigins({})).toEqual(['http://localhost:5173']);
  });

  it('needs every setting, and the real Google secret on production alone', async () => {
    const { db } = await deployment(PRODUCTION);
    for (const name of ['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'OAUTH_PROXY_SECRET', 'GOOGLE_CLIENT_SECRET']) {
      expect(() => makeAuth({ ...PRODUCTION, [name]: '' }, db.db), name).toThrow(`${name} not set`);
    }
    expect(() => makeAuth({ ...PREVIEW, GOOGLE_CLIENT_SECRET: undefined }, db.db)).not.toThrow();
    // A preview never holds Google's real secret, even one its environment has.
    const preview = makeAuth({ ...PREVIEW, GOOGLE_CLIENT_SECRET: 'real-google-secret' }, db.db);
    expect(preview.options.socialProviders.google.clientSecret).toBe('exchanged-by-production');
    expect(makeAuth(PRODUCTION, db.db).options.socialProviders.google.clientSecret).toBe('real-google-secret');
  });
});

describe('errors inside Better Auth', () => {
  it("reach Sentry when they are the server's, never when they are the request's", async () => {
    const { auth, db } = await deployment(PRODUCTION);
    const { page } = await signInOnProduction(auth, OWNER);
    const page404 = await page.send(auth, '/list-sessions');
    expect(page404.status).toBe(404);
    expect(sentry.captureException).not.toHaveBeenCalled();
    // The database gone from under it: the session can't be read.
    db.client.close();
    const res = await page.send(auth, '/get-session');
    expect(res.status).toBe(500);
    expect(sentry.captureException).toHaveBeenCalled();
  });

  it('are reported by onAPIError above a 4xx, and by the log at its error level alone', async () => {
    await reportAuthError(new APIError('NOT_FOUND'));
    expect(sentry.captureException).not.toHaveBeenCalled();
    const broken = new APIError('INTERNAL_SERVER_ERROR');
    await reportAuthError(broken);
    expect(sentry.captureException).toHaveBeenLastCalledWith(broken);
    const thrown = new Error('database gone');
    await reportAuthError(thrown);
    expect(sentry.captureException).toHaveBeenLastCalledWith(thrown);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    authLog('warn', 'Invalid id token', { provider: 'google' });
    authLog('info', 'note');
    expect(warn).toHaveBeenCalledWith('auth: Invalid id token', { provider: 'google' });
    expect(log).toHaveBeenCalledWith('auth: note');
    sentry.captureException.mockClear();
    authLog('error', 'Failed to validate authorization code', thrown);
    authLog('error', 'OAuth proxy payload expired');
    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledTimes(2));
    expect(sentry.captureException).toHaveBeenNthCalledWith(1, thrown);
    expect(sentry.captureException).toHaveBeenNthCalledWith(2, new Error('OAuth proxy payload expired'));
  });
});

describe("the deployment's Better Auth", () => {
  it('is made once its database is open and checked, and made afresh after a failure', async () => {
    const { path } = await deployment(PRODUCTION);
    await expect(deployedAuth({ DEV_DB_PATH: path })).rejects.toThrow('BETTER_AUTH_SECRET not set');
    const made = await deployedAuth({ ...SECRETS, DEV_DB_PATH: path });
    expect(await deployedAuth()).toBe(made);
    const ok = await made.handler(new Request('http://localhost:5173/api/auth/ok'));
    expect(await ok.json()).toEqual({ ok: true });
  });
});
