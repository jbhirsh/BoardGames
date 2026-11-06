import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import { oAuthProxy } from 'better-auth/plugins/oauth-proxy';
import { passkey } from '@better-auth/passkey';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { database } from './_db/client.js';
import { authAccount, authPasskey, authSession, authUser, authVerification } from './_db/schema.js';
import type { Headers } from './_lib/json.js';
import { isOwnerEmail } from './_lib/owner.js';
import type { OwnerSession } from './_resolvers/context.js';
import { reportError } from './_lib/sentry.js';

// Files in api/ that start with `_` are not exposed as routes by Vercel.
//
// The owner's sign-in (#296), with Better Auth at /api/auth/* (vercel.json
// rewrites it to api/graphql.ts, which hands it here): Google by redirect,
// then a passkey (Face ID) added once signed in. Any Google account can sign
// in; only the one whose verified email is SUGGESTIONS_TO is the owner
// (ownerSessionReader), and everyone else's session counts for nothing, as
// the public's does. The session is an HttpOnly, SameSite=Lax cookie on
// this deployment's own origin, kept in Turso's auth_* tables
// (api/_db/schema.ts) for 30 days from its last use.
//
// Only the routes the app uses answer (allowedRoute); every other one is a
// 404. There's no rate limiter: a sign-in that's started and never
// finished leaves a verification row that expires, and an account row per
// Google account.
//
// Previews sign in through production (the OAuth proxy): Google calls back
// only to production's address, which exchanges the code and hands the
// preview an encrypted profile, and the preview makes the session in its
// own database. A preview builds any PR's code, Dependabot's included, so
// it holds nothing that makes a session on the real site: production keeps
// the real Google client secret (previews get a stand-in, and their build
// fails if the real one is set for them: scripts/check-auth-env.ts; only
// production exchanges codes), refuses the proxy's completion route, and
// takes no Google ID token at sign-in (`disableIdTokenSignIn`), which a
// preview is handed with each profile and production would otherwise
// accept for an hour. What OAUTH_PROXY_SECRET still gives whoever holds it:
// production sends the Google profile (name, email, picture, and Google's
// access, refresh and ID tokens) of whoever finishes a sign-in it started
// to any address it names. Whoever crafts that sign-in's state also
// chooses the scopes it asks Google for, though Google's consent screen
// still shows them to the person signing in.

/** The production site, where Google sends every sign-in back to. */
export const PRODUCTION_ORIGIN = 'https://board-games-silk.vercel.app';

export type Env = Record<string, string | undefined>;

/** Whether this deployment is the real site. */
const isProduction = (env: Env) => env.VERCEL_ENV === 'production';

/**
 * This deployment's origin: what cookies and passkeys are bound to. A
 * preview is its branch's address (Vercel's "Preview" link), which stays
 * the same across the branch's pushes, so a passkey made there keeps
 * working. Elsewhere (a test) the Vite dev server's.
 */
export function authOrigin(env: Env): string {
  if (isProduction(env)) return PRODUCTION_ORIGIN;
  if (env.VERCEL_ENV === 'preview' && env.VERCEL_BRANCH_URL) return `https://${env.VERCEL_BRANCH_URL}`;
  return 'http://localhost:5173';
}

/**
 * The origins sign-in requests and redirects may come from or go to: this
 * deployment's own, and a preview's per-deployment address too. No
 * wildcard: a pattern on vercel.app could match a stranger's project.
 */
export function trustedOrigins(env: Env): string[] {
  const own = authOrigin(env);
  if (env.VERCEL_ENV === 'preview' && env.VERCEL_URL) return [...new Set([own, `https://${env.VERCEL_URL}`])];
  return [own];
}

/**
 * Better Auth's routes the app uses, by route pattern (a hook's `ctx.path`,
 * after Better Auth has parsed the URL, however it was spelled): starting a
 * Google sign-in and Google's return, the passkey's four steps (adding one,
 * signing in with one), signing out, reading the session, and Better Auth's
 * health check and error page.
 */
const ROUTES = new Set([
  '/sign-in/social',
  '/callback/:id',
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/generate-authenticate-options',
  '/passkey/verify-authentication',
  '/sign-out',
  '/get-session',
  '/ok',
  '/error',
]);

/**
 * Whether this deployment answers a route: only the app's (ROUTES), and on
 * a preview the proxy's completion too, which turns production's encrypted
 * profile into the preview's session. Production refuses it, and both
 * refuse the proxy's older completion route, which nothing calls.
 */
export function allowedRoute(path: string | undefined, env: Env): boolean {
  if (path === undefined) return false;
  return ROUTES.has(path) || (!isProduction(env) && path === '/callback/:id/oauth-proxy');
}

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} not set`);
  return value;
}

const DAY_S = 24 * 60 * 60;

/** What Better Auth's logger publishes (warn and up): to the console, as its own logger would. */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Better Auth's log: an error to Sentry too, so the failures it only logs
 * (an OAuth callback or the proxy's completion that becomes a redirect to
 * /sign-in?error=<code>) are seen; anything else to the console.
 */
export function authLog(level: LogLevel, message: string, ...args: unknown[]): void {
  if (level === 'error') {
    const cause = args.find((arg) => arg instanceof Error) ?? new Error(message);
    void reportError(`auth: ${message}`, cause);
    return;
  }
  if (level === 'warn') console.warn(`auth: ${message}`, ...args);
  else console.log(`auth: ${message}`, ...args);
}

/**
 * Better Auth's handler for an error inside one of its routes, in place of
 * its own logging: a refusal (a 4xx) is the request's fault and goes
 * unreported; anything else, a 5xx or a throw, goes to Sentry.
 */
export async function reportAuthError(error: unknown): Promise<void> {
  if (isAPIError(error) && error.statusCode < 500) return;
  await reportError('auth api error:', error);
}

/** Better Auth's options for this deployment, storing through `db`. */
function authOptions(env: Env, db: LibSQLDatabase) {
  const origin = authOrigin(env);
  return {
    appName: 'The Game Room',
    baseURL: origin,
    secret: required(env, 'BETTER_AUTH_SECRET'),
    trustedOrigins: trustedOrigins(env),
    // Keyed by model name, as the adapter looks a table up. Better Auth
    // checks these against what it writes on first use (its schema check,
    // left on: with Drizzle it reads this object, not the database).
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        auth_user: authUser,
        auth_session: authSession,
        auth_account: authAccount,
        auth_verification: authVerification,
        auth_passkey: authPasskey,
      },
    }),
    user: { modelName: 'auth_user' },
    // 30 days from the last use: a session older than a day is extended,
    // its cookie with it (ownerSessionReader passes the new one on). Adding
    // a passkey needs one signed in within the day (freshAge).
    session: { modelName: 'auth_session', expiresIn: 30 * DAY_S, updateAge: DAY_S, freshAge: DAY_S },
    // The app never calls Google, so its tokens are never read; they're
    // kept encrypted all the same.
    account: { modelName: 'auth_account', encryptOAuthTokens: true },
    verification: { modelName: 'auth_verification' },
    // Decided on #296: no rate limiter (see the top of this file).
    rateLimit: { enabled: false },
    // Better Auth's errors land on the app's page, as /sign-in?error=<code>,
    // and what goes wrong inside it reaches Sentry.
    onAPIError: { errorURL: '/sign-in', onError: reportAuthError },
    logger: { level: 'warn' as const, log: authLog },
    advanced: {
      // Checked everywhere, tests included (Better Auth skips it under
      // NODE_ENV=test unless told).
      disableOriginCheck: false,
    },
    // Ahead of every plugin's hooks. Reads `env` as each request comes.
    hooks: {
      before: createAuthMiddleware((ctx) => {
        if (!allowedRoute(ctx.path, env)) throw new APIError('NOT_FOUND');
        return Promise.resolve();
      }),
    },
    socialProviders: {
      google: {
        clientId: required(env, 'GOOGLE_CLIENT_ID'),
        // A preview never exchanges a code (production does, for it), but
        // the provider won't start a sign-in without some secret: a stand-in,
        // whatever the environment holds (see the top of this file).
        clientSecret: isProduction(env) ? required(env, 'GOOGLE_CLIENT_SECRET') : 'exchanged-by-production',
        prompt: 'select_account' as const,
        // Sign-in is the redirect only; see the top of this file.
        disableIdTokenSignIn: true,
      },
    },
    plugins: [
      passkey({
        rpID: new URL(origin).hostname,
        rpName: 'The Game Room',
        origin,
        schema: { passkey: { modelName: 'auth_passkey' } },
      }),
      oAuthProxy({ productionURL: PRODUCTION_ORIGIN, secret: required(env, 'OAUTH_PROXY_SECRET') }),
    ],
  };
}

/** Better Auth for this deployment, storing through `db`. */
export const makeAuth = (env: Env, db: LibSQLDatabase) => betterAuth(authOptions(env, db));
export type Auth = ReturnType<typeof makeAuth>;

let instance: Promise<Auth> | undefined;

/**
 * This instance's Better Auth, made on first use, once its database is open
 * and checked (api/_db/client.ts). One that fails (a setting missing, the
 * database out of reach) is tried afresh by the next request.
 */
export function auth(env: Env = process.env): Promise<Auth> {
  instance ??= database(env)
    .then((db) => makeAuth(env, db))
    .catch((err: unknown) => {
      instance = undefined;
      throw err;
    });
  return instance;
}

// Better Auth's session cookie, under either of its names (`__Secure-` on
// https). A request without one is signed out, with no lookup to make.
const SESSION_COOKIE = /(^|;\s*)(__Secure-)?better-auth\.session_token=/;

/** Whether a request carries a session cookie at all. */
export function hasSessionCookie(cookie: string | string[] | undefined): boolean {
  const value = Array.isArray(cookie) ? cookie.join('; ') : cookie;
  return typeof value === 'string' && SESSION_COOKIE.test(value);
}

/**
 * Reads whether a request's session is the owner's: a live Better Auth
 * session whose user's email is `ownerEmail()` and verified. A request with
 * no session cookie is answered at once, so a plain visit never builds
 * Better Auth or opens the database. A session older than a day is extended
 * as it's read, and the renewed cookie handed back to go out with the
 * answer: the database's row lasting 30 more days is no use if the
 * browser's cookie still expires 30 days after sign-in. A session that
 * can't be read (a setting missing, the database out of reach) is reported
 * and counts as signed out, rather than failing the public's reads with it.
 */
export function ownerSessionReader(getAuth: () => Promise<Auth>, ownerEmail: () => string | null) {
  return async (headers: Headers): Promise<OwnerSession> => {
    if (!hasSessionCookie(headers.cookie)) return { owner: false };
    try {
      const { headers: answer, response } = await (
        await getAuth()
      ).api.getSession({ headers: fromNodeHeaders(headers), returnHeaders: true });
      const setCookies = answer.getSetCookie();
      const user = response?.user;
      const owner = user !== undefined && user.emailVerified && isOwnerEmail(user.email, ownerEmail());
      return setCookies.length ? { owner, setCookies } : { owner };
    } catch (err) {
      await reportError('auth: the session could not be read', err);
      return { owner: false };
    }
  };
}
