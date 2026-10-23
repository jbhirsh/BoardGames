import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforceRateLimit, getLimiter } from './_lib/rateLimit.js';
import { getRedis } from './_lib/redis.js';
import { failWith500, initSentry, reportError } from './_lib/sentry.js';
import { baseUrl, button, escapeHtml, mailLayout, ownerEmail, page, resendMailer, type Mailer } from './_lib/mail.js';
import {
  ID_RE,
  SESSION_TTL_S,
  isAdmin,
  isJsonRequest,
  newId,
  sessionCookie,
  sessionIdFrom,
  sessionKey,
  type Headers,
  type SessionRedis,
} from './_lib/session.js';

initSentry();

/**
 * Owner sign-in by magic link. POST an email: if it is the owner's, a
 * single-use link goes out (the answer is the same either way, so the
 * address can't be probed). The link opens a confirmation page whose form
 * POSTs the token back, because mail scanners follow every link; only that
 * POST ({ action: 'verify', token }) consumes the token (getdel) and sets the
 * session cookie: a session id kept 30 days, HttpOnly, Secure and
 * SameSite=Lax, the main CSRF defence. A malformed token on either step gets
 * a standalone page with its 400, not JSON. GET reports { admin } for the
 * cookie a request carries; POST { action: 'logout' }, JSON only like every
 * owner mutation, deletes the session. The owner is whoever reads the
 * SUGGESTIONS_TO inbox: there is an admin mode, but no password.
 */
const MAGIC_TTL_S = 15 * 60;
const magicKey = (token: string) => `auth:magic:${token}`;

export interface AuthRedis extends SessionRedis {
  getdel(key: string): Promise<unknown>;
}

export interface AuthRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers: Headers;
}

export interface AuthResponse {
  status(code: number): AuthResponse;
  json(data: unknown): AuthResponse;
  setHeader(name: string, value: string): AuthResponse;
  send(body: string): AuthResponse;
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

const html = (res: AuthResponse) => res.setHeader('Content-Type', 'text/html; charset=utf-8');

// The sign-in link and its confirmation form open in a browser, so a bad
// token gets a page a person can read, not JSON.
const badLink = (res: AuthResponse) =>
  html(res)
    .status(400)
    .send(
      page(
        'Link not recognised',
        '<p>This sign-in link is incomplete or mistyped. Ask for a new one from the wishlist.</p>',
      ),
    );

export async function handleAuth(deps: AuthDeps, req: AuthRequest, res: AuthResponse): Promise<AuthResponse> {
  const { redis } = deps;
  try {
    if (req.method === 'GET') {
      const token = req.query.token;
      if (token === undefined) {
        return res.status(200).json({ admin: await isAdmin(redis, req.headers) });
      }
      if (typeof token !== 'string' || !ID_RE.test(token)) return badLink(res);
      const live = (await redis.get(magicKey(token))) !== null;
      html(res);
      if (!live) {
        return res
          .status(200)
          .send(
            page(
              'Link expired',
              '<p>This sign-in link has expired or was already used. Ask for a new one from the wishlist.</p>',
            ),
          );
      }
      return res
        .status(200)
        .send(
          page(
            'Sign in to The Game Room?',
            '<p>This signs this browser in as the owner for 30 days.</p>' +
              `<form method="post" action="/api/auth"><input type="hidden" name="action" value="verify"><input type="hidden" name="token" value="${escapeHtml(token)}">` +
              '<button type="submit" style="background:#0071E3">Sign in</button></form>',
          ),
        );
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;

      if (body.action === 'verify') {
        const token = body.token;
        if (typeof token !== 'string' || !ID_RE.test(token)) return badLink(res);
        // getdel makes the link single-use even under a double submit.
        if ((await redis.getdel(magicKey(token))) === null) {
          html(res);
          return res
            .status(403)
            .send(
              page(
                'Link expired',
                '<p>This sign-in link has expired or was already used. Ask for a new one from the wishlist.</p>',
              ),
            );
        }
        const id = (deps.randomToken ?? newId)();
        await redis.set(sessionKey(id), '1', { ex: SESSION_TTL_S });
        res.setHeader('Set-Cookie', sessionCookie(id));
        res.setHeader('Location', '/?c=want');
        return res.status(303).send('');
      }

      if (body.action === 'logout') {
        // JSON only, like every other owner mutation: a cross-site form could
        // otherwise clear the cookie out from under the owner (see isJsonRequest).
        if (!isJsonRequest(req.headers)) {
          return res.status(403).json({ error: 'owner actions must be sent as JSON' });
        }
        const id = sessionIdFrom(req.headers);
        if (id) await redis.del(sessionKey(id));
        res.setHeader('Set-Cookie', sessionCookie(null));
        return res.status(200).json({ ok: true });
      }

      if (body.action !== undefined) {
        return res.status(400).json({ error: 'unknown action' });
      }

      if (!deps.mailer || !deps.ownerEmail) {
        return res.status(503).json({ error: 'Sign-in is not set up yet' });
      }
      const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
      if (!email || email.length > 254 || !email.includes('@')) {
        return res.status(400).json({ error: 'enter an email address' });
      }
      // Same answer, same timing, for any address: the owner's email is not
      // discoverable here. Both branches make one Redis round trip, the
      // answer goes out before the email does, and a failed send is reported
      // rather than turned into a status the caller could read.
      const isOwner = email === normalizeEmail(deps.ownerEmail);
      const token = (deps.randomToken ?? newId)();
      if (isOwner) await redis.set(magicKey(token), '1', { ex: MAGIC_TTL_S });
      else await redis.get(magicKey(token));
      res.status(200).json({ ok: true });
      if (isOwner) {
        const link = `${deps.baseUrl()}/api/auth?token=${encodeURIComponent(token)}`;
        try {
          await deps.mailer.send(signInMail(link));
        } catch (err) {
          await reportError('auth: could not send the sign-in link', err);
        }
      }
      return res;
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return failWith500(res, 'auth api error:', err);
  }
}

// Each link request sends an email, so it is bounded tightly per IP.
const linkLimiter = getLimiter('auth', 5, 3600);

function isLinkRequest(req: VercelRequest): boolean {
  const body = req.body as Record<string, unknown> | undefined;
  return req.method === 'POST' && body?.action === undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (isLinkRequest(req) && !(await enforceRateLimit(linkLimiter, req, res))) return;
  await handleAuth({ redis: getRedis(), mailer: resendMailer(), ownerEmail: ownerEmail(), baseUrl }, req, res);
}
