import { describe, it, expect, vi } from 'vitest';
import { isAdmin, isJsonRequest, parseCookies, sessionCookie, sessionIdFrom, sessionKey, newId, ID_RE } from '../../api/_lib/session';

const SID = 'test-session-' + 'a'.repeat(20);

describe('session helpers', () => {
  it('parses a cookie header, tolerating spaces, arrays and junk', () => {
    expect(parseCookies('a=1; gr_session=abc; b=x=y')).toEqual({ a: '1', gr_session: 'abc', b: 'x=y' });
    expect(parseCookies(['a=1', 'b=2'])).toEqual({ a: '1', b: '2' });
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('novalue; =empty; ok=1')).toEqual({ ok: '1' });
  });

  it('reads only a well-formed session id', () => {
    expect(sessionIdFrom({ cookie: `gr_session=${SID}` })).toBe(SID);
    expect(sessionIdFrom({ cookie: 'gr_session=short' })).toBeNull();
    expect(sessionIdFrom({ cookie: 'gr_session=has space' + 'a'.repeat(20) })).toBeNull();
    expect(sessionIdFrom({})).toBeNull();
  });

  it('is admin only when the cookie names a live session', async () => {
    const get = vi.fn(async (key: string) => (key === sessionKey(SID) ? '1' : null));
    const redis = { get, set: vi.fn(), del: vi.fn() };
    expect(await isAdmin(redis, { cookie: `gr_session=${SID}` })).toBe(true);
    expect(await isAdmin(redis, { cookie: 'gr_session=' + 'b'.repeat(24) })).toBe(false);
    expect(await isAdmin(redis, {})).toBe(false);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('builds an HttpOnly, Secure, Lax cookie and a clearing one', () => {
    const set = sessionCookie(SID);
    expect(set).toContain(`gr_session=${SID}; Max-Age=2592000`);
    expect(set).toContain('HttpOnly');
    expect(set).toContain('Secure');
    expect(set).toContain('SameSite=Lax');
    expect(set).toContain('Path=/');
    expect(sessionCookie(null)).toContain('gr_session=; Max-Age=0');
  });

  it('treats only JSON content types as JSON requests', () => {
    expect(isJsonRequest({ 'content-type': 'application/json' })).toBe(true);
    expect(isJsonRequest({ 'content-type': 'Application/JSON; charset=utf-8' })).toBe(true);
    expect(isJsonRequest({ 'content-type': ['application/json'] })).toBe(true);
    expect(isJsonRequest({ 'content-type': 'application/x-www-form-urlencoded' })).toBe(false);
    expect(isJsonRequest({})).toBe(false);
  });

  it('mints ids the reader accepts', () => {
    const id = newId();
    expect(id).toMatch(ID_RE);
    expect(newId()).not.toBe(id);
  });
});
