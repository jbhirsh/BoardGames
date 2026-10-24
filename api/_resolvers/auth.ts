// Owner sign-in by magic link (Mutation.requestSignInLink, Query.signInLinkLive,
// Mutation.verifySignIn, Mutation.logout, Query.session). Ask with an email:
// if it is the owner's, a single-use link goes out (the answer is the same
// either way, and goes out before the email does, so the address can't be
// probed). The link opens the app's /sign-in/confirm page, which only reads
// whether it is live: mail scanners follow every link, so only the page's
// button, sending verifySignIn, consumes the token (getdel) and sets the
// session cookie: a session id kept 30 days, HttpOnly, Secure and
// SameSite=Lax, the main CSRF defence. logout, JSON only like every owner
// mutation, deletes the session. The owner is whoever reads the
// SUGGESTIONS_TO inbox: there is an admin mode, but no password.

import { button, mailLayout, type Mailer } from '../_lib/mail.js';
import { reportError } from '../_lib/sentry.js';
import {
  ID_RE,
  SESSION_TTL_S,
  newId,
  sessionCookie,
  sessionIdFrom,
  sessionKey,
  type Headers,
  type SessionRedis,
} from '../_lib/session.js';
import { ApiError } from './errors.js';

const MAGIC_TTL_S = 15 * 60;
const magicKey = (token: string) => `auth:magic:${token}`;

export interface AuthRedis extends SessionRedis {
  getdel(key: string): Promise<unknown>;
}

export interface AuthDeps {
  redis: AuthRedis;
  mailer: Mailer | null;
  /** The only address that can sign in; null disables sign-in. */
  ownerEmail: string | null;
  baseUrl: () => string;
  randomToken?: () => string;
}

const normalizeEmail = (s: string) => s.trim().toLowerCase();

function signInMail(link: string) {
  return {
    subject: 'Sign in to The Game Room',
    html: mailLayout(
      `<h2 style="margin:0 0 12px">Your sign-in link</h2>
<p style="margin:0 0 20px">Open this on the device you want to manage the wishlist from. It works once and expires in 15 minutes.</p>
${button(link, 'Sign in', '#0071E3')}`,
      "If you didn't ask for this, ignore it; nothing happens until the link is used.",
    ),
  };
}

const BAD_LINK = 'This sign-in link is incomplete or mistyped. Ask for a new one from the wishlist.';
const EXPIRED = 'This sign-in link has expired or was already used. Ask for a new one from the wishlist.';

/** A well-formed token, or the 400 a mistyped link gets. */
function checkToken(token: unknown): string {
  if (typeof token !== 'string' || !ID_RE.test(token)) throw new ApiError(400, BAD_LINK);
  return token;
}

/**
 * Stores a sign-in token and hands the email to `defer`, which sends it
 * after the answer, when `email` is the owner's; for any other address it
 * makes the same Redis round trip and sends nothing. A failed send is
 * reported rather than turned into an answer the caller could read.
 */
export async function requestSignInLink(
  deps: AuthDeps,
  rawEmail: unknown,
  defer: (work: Promise<void>) => void,
): Promise<void> {
  const { mailer, ownerEmail } = deps;
  if (!mailer || !ownerEmail) throw new ApiError(503, 'Sign-in is not set up yet');
  const email = typeof rawEmail === 'string' ? normalizeEmail(rawEmail) : '';
  if (!email || email.length > 254 || !email.includes('@')) throw new ApiError(400, 'enter an email address');
  const isOwner = email === normalizeEmail(ownerEmail);
  const token = (deps.randomToken ?? newId)();
  if (isOwner) await deps.redis.set(magicKey(token), '1', { ex: MAGIC_TTL_S });
  else await deps.redis.get(magicKey(token));
  if (!isOwner) return;
  const link = `${deps.baseUrl()}/sign-in/confirm?token=${encodeURIComponent(token)}`;
  defer(
    mailer.send(signInMail(link)).catch((err: unknown) => reportError('auth: could not send the sign-in link', err)),
  );
}

/** Whether a sign-in link's token is still unused; reading it changes nothing. */
export async function signInLinkLive(redis: AuthRedis, token: unknown): Promise<boolean> {
  return (await redis.get(magicKey(checkToken(token)))) !== null;
}

/**
 * Consumes the token (getdel makes the link single-use even under a double
 * press) and opens a 30-day session, answering the Set-Cookie value that
 * installs it.
 */
export async function verifySignIn(deps: AuthDeps, rawToken: unknown): Promise<string> {
  const token = checkToken(rawToken);
  if ((await deps.redis.getdel(magicKey(token))) === null) throw new ApiError(403, EXPIRED);
  const id = (deps.randomToken ?? newId)();
  await deps.redis.set(sessionKey(id), '1', { ex: SESSION_TTL_S });
  return sessionCookie(id);
}

/** Deletes the request's session, if it names one, answering the Set-Cookie value that clears it. */
export async function logout(redis: SessionRedis, headers: Headers): Promise<string> {
  const id = sessionIdFrom(headers);
  if (id) await redis.del(sessionKey(id));
  return sessionCookie(null);
}
