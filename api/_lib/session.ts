// Owner sessions for admin mode. A session is a random id stored in Redis
// with a TTL and handed to the browser as an HttpOnly cookie; the browser
// never sees a secret it could leak to scripts, and signing out is a delete.
import { randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'gr_session';
export const SESSION_TTL_S = 30 * 24 * 3600;
export const ID_RE = /^[A-Za-z0-9_-]{20,64}$/;

export interface SessionRedis {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, opts: { ex: number }): Promise<unknown>;
  del(key: string): Promise<number>;
}

export type Headers = Record<string, string | string[] | undefined>;

export const sessionKey = (id: string) => `auth:session:${id}`;

export const newId = () => randomBytes(24).toString('base64url');

export function parseCookies(header: string | string[] | undefined): Record<string, string> {
  const raw = Array.isArray(header) ? header.join(';') : header ?? '';
  const out: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name) out[name] = part.slice(eq + 1).trim();
  }
  return out;
}

/** The session id the request carries, or null when absent or malformed. */
export function sessionIdFrom(headers: Headers): string | null {
  const id = parseCookies(headers.cookie)[SESSION_COOKIE];
  return id && ID_RE.test(id) ? id : null;
}

/** True when the request's cookie names a live owner session. */
export async function isAdmin(redis: SessionRedis, headers: Headers): Promise<boolean> {
  const id = sessionIdFrom(headers);
  if (!id) return false;
  return (await redis.get(sessionKey(id))) !== null;
}

/** Set-Cookie value that installs the session, or clears it when id is null. */
export function sessionCookie(id: string | null): string {
  const attrs = 'Path=/; HttpOnly; Secure; SameSite=Lax';
  return id ? `${SESSION_COOKIE}=${id}; Max-Age=${SESSION_TTL_S}; ${attrs}` : `${SESSION_COOKIE}=; Max-Age=0; ${attrs}`;
}

/**
 * Cross-site forms can post urlencoded bodies with the cookie attached;
 * they cannot send JSON without a CORS preflight the API never answers.
 * Requiring JSON on every admin mutation is the CSRF check.
 */
export function isJsonRequest(headers: Headers): boolean {
  const ct = headers['content-type'];
  const value = Array.isArray(ct) ? ct[0] : ct;
  return typeof value === 'string' && value.toLowerCase().includes('application/json');
}
