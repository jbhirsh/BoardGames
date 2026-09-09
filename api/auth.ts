import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as Sentry from '@sentry/node';
import { enforceRateLimit, getLimiter } from './_lib/rateLimit.js';
import { getRedis } from './_lib/redis.js';
import { baseUrl, button, escapeHtml, ownerEmail, page, resendMailer, type Mailer } from './_lib/mail.js';
import {
  ID_RE, SESSION_TTL_S, isAdmin, isJsonRequest, newId, sessionCookie, sessionIdFrom, sessionKey,
  type Headers, type SessionRedis,
} from './_lib/session.js';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

/**
 * Owner sign-in by magic link. POST an email: if it is the owner's, a
 * single-use link goes out (the answer is the same either way, so the
 * address can't be probed). The link opens a confirmation page whose form
 * POSTs the token back, because mail scanners follow every link; only that
 * POST consumes the token and sets the session cookie.
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
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1D1D1F">
<h2 style="margin:0 0 12px">Your sign-in link</h2>
<p style="margin:0 0 20px">Open this on the device you want to manage the wishlist from. It works once and expires in 15 minutes.</p>
${button(link, 'Sign in', '#0071E3')}
<p style="margin:24px 0 0;font-size:12px;color:#86868B">If you didn't ask for this, ignore it; nothing happens until the link is used.</p>
</div>`,
  };
}

const html = (res: AuthResponse) => res.setHeader('Content-Type', 'text/html; charset=utf-8');

export async function handleAuth(deps: AuthDeps, req: AuthRequest, res: AuthResponse): Promise<AuthResponse> {
  const { redis } = deps;
  try {
    if (req.method === 'GET') {
      const token = req.query.token;
      if (token === undefined) {
        return res.status(200).json({ admin: await isAdmin(redis, req.headers) });
      }
      if (typeof token !== 'string' || !ID_RE.test(token)) {
        return res.status(400).json({ error: 'invalid token' });
      }
      const live = (await redis.get(magicKey(token))) !== null;
      html(res);
      if (!live) {
        return res.status(200).send(page('Link expired', '<p>This sign-in link has expired or was already used. Ask for a new one from the wishlist.</p>'));
      }
      return res.status(200).send(page(
        'Sign in to The Game Room?',
        '<p>This signs this browser in as the owner for 30 days.</p>' +
        `<form method="post" action="/api/auth"><input type="hidden" name="action" value="verify"><input type="hidden" name="token" value="${escapeHtml(token)}">` +
        '<button type="submit" style="background:#0071E3">Sign in</button></form>',
      ));
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;

      if (body.action === 'verify') {
        const token = body.token;
        if (typeof token !== 'string' || !ID_RE.test(token)) {
          return res.status(400).json({ error: 'invalid token' });
        }
        // getdel makes the link single-use even under a double submit.
        if ((await redis.getdel(magicKey(token))) === null) {
          html(res);
          return res.status(403).send(page('Link expired', '<p>This sign-in link has expired or was already used. Ask for a new one from the wishlist.</p>'));
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
          Sentry.captureException(err);
          await Sentry.flush(2000);
          console.error('auth: could not send the sign-in link', err);
        }
      }
      return res;
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error('auth api error:', err);
    return res.status(500).json({ error: 'Server error' });
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
