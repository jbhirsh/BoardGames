import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The browser's side of sign-in (client/auth.ts): what it asks /api/auth,
// and how it reports the answer. The WebAuthn prompts are the test's.

/** What the passkey client hands a WebAuthn prompt. */
type Prompt = (options: { optionsJSON: { challenge: string } }) => Promise<unknown>;

const webauthn = vi.hoisted(() => ({
  startAuthentication: vi.fn<Prompt>(),
  startRegistration: vi.fn<Prompt>(),
}));
vi.mock('@simplewebauthn/browser', async (importActual) => ({
  ...(await importActual<typeof import('@simplewebauthn/browser')>()),
  startAuthentication: webauthn.startAuthentication,
  startRegistration: webauthn.startRegistration,
}));

/** One request the client made: its method, path and JSON body. */
interface Sent {
  method: string;
  path: string;
  body: unknown;
}

type Answer = Response | (() => Promise<Response>);
let answers: Record<string, Answer> = {};
let sent: Sent[] = [];

beforeEach(() => {
  answers = {};
  sent = [];
  webauthn.startAuthentication.mockReset();
  webauthn.startRegistration.mockReset();
  // The client keeps the fetch it was made with, so each test makes a fresh one.
  vi.resetModules();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(new URL(String(input), location.href), init);
      const path = new URL(request.url).pathname;
      const text = await request.text();
      sent.push({ method: request.method, path, body: text ? (JSON.parse(text) as unknown) : undefined });
      const answer = answers[path];
      if (!answer) return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
      return typeof answer === 'function' ? answer() : answer.clone();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const load = () => import('../client/auth');

describe('client/auth', () => {
  it('starts a Google sign-in that comes back to /sign-in either way', async () => {
    answers['/api/auth/sign-in/social'] = Response.json({ url: '/sign-in', redirect: false });
    const { signInWithGoogle } = await load();
    expect(await signInWithGoogle()).toEqual({ ok: true });
    expect(sent).toEqual([
      {
        method: 'POST',
        path: '/api/auth/sign-in/social',
        body: {
          provider: 'google',
          callbackURL: `${location.origin}/sign-in`,
          errorCallbackURL: `${location.origin}/sign-in`,
        },
      },
    ]);
  });

  it("reports Better Auth's code, a bare status, or no answer at all", async () => {
    const { signInWithGoogle, signOut } = await load();
    answers['/api/auth/sign-in/social'] = Response.json({ code: 'INVALID_CALLBACK_URL' }, { status: 403 });
    expect(await signInWithGoogle()).toEqual({ ok: false, code: 'INVALID_CALLBACK_URL' });
    answers['/api/auth/sign-in/social'] = new Response('', { status: 502 });
    expect(await signInWithGoogle()).toEqual({ ok: false, code: 'HTTP_502' });
    answers['/api/auth/sign-out'] = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await signOut()).toEqual({ ok: false, code: 'NETWORK' });
  });

  it('signs out on the server', async () => {
    answers['/api/auth/sign-out'] = Response.json({ success: true });
    const { signOut } = await load();
    expect(await signOut()).toEqual({ ok: true });
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual(['POST /api/auth/sign-out']);
  });

  it('reads whose account is signed in, if any', async () => {
    const { signedInEmail } = await load();
    answers['/api/auth/get-session'] = Response.json({ user: { email: 'sam.rivera@gmail.com' }, session: {} });
    expect(await signedInEmail()).toBe('sam.rivera@gmail.com');
    answers['/api/auth/get-session'] = Response.json(null);
    expect(await signedInEmail()).toBeNull();
    answers['/api/auth/get-session'] = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await signedInEmail()).toBeNull();
  });

  it('signs in with a passkey: the options, the prompt, then the check', async () => {
    answers['/api/auth/passkey/generate-authenticate-options'] = Response.json({ challenge: 'c', rpId: 'localhost' });
    answers['/api/auth/passkey/verify-authentication'] = Response.json({ session: {}, user: {} });
    webauthn.startAuthentication.mockResolvedValue({ id: 'cred', response: {}, clientExtensionResults: {} });
    const { signInWithPasskey } = await load();
    expect(await signInWithPasskey()).toEqual({ ok: true });
    expect(webauthn.startAuthentication.mock.calls[0][0].optionsJSON.challenge).toBe('c');
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      'GET /api/auth/passkey/generate-authenticate-options',
      'POST /api/auth/passkey/verify-authentication',
    ]);
    expect(sent[1].body).toEqual({ response: { id: 'cred', response: {} } });
  });

  it('reports a passkey prompt that was closed', async () => {
    answers['/api/auth/passkey/generate-authenticate-options'] = Response.json({ challenge: 'c' });
    webauthn.startAuthentication.mockRejectedValue(new Error('closed'));
    const { signInWithPasskey } = await load();
    expect(await signInWithPasskey()).toEqual({ ok: false, code: 'AUTH_CANCELLED' });
  });

  it('adds a passkey, or says a session over a day old needs Google again', async () => {
    const { addPasskey } = await load();
    answers['/api/auth/passkey/generate-register-options'] = Response.json(
      { code: 'SESSION_NOT_FRESH', message: 'Session is not fresh' },
      { status: 403 },
    );
    expect(await addPasskey()).toEqual({ ok: false, code: 'SESSION_NOT_FRESH' });
    expect(webauthn.startRegistration).not.toHaveBeenCalled();

    answers['/api/auth/passkey/generate-register-options'] = Response.json({ challenge: 'c' });
    answers['/api/auth/passkey/verify-registration'] = Response.json({ id: 'passkey-1' });
    webauthn.startRegistration.mockResolvedValue({ id: 'cred', response: {}, clientExtensionResults: {} });
    expect(await addPasskey()).toEqual({ ok: true });
    expect(sent.at(-1)).toMatchObject({ method: 'POST', path: '/api/auth/passkey/verify-registration' });
  });
});
