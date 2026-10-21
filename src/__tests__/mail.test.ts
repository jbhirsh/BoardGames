import { describe, it, expect, vi, afterEach } from 'vitest';
import { baseUrl, button, escapeHtml, ownerEmail, page, resendMailer } from '../../api/_lib/mail';

const ENV = ['RESEND_API_KEY', 'SUGGESTIONS_TO', 'SUGGESTIONS_FROM', 'APP_URL', 'VERCEL_PROJECT_PRODUCTION_URL'] as const;

describe('mail helpers', () => {
  afterEach(() => {
    for (const k of ENV) delete process.env[k];
    vi.restoreAllMocks();
  });

  it('has no mailer until both the key and the owner address are set', () => {
    expect(resendMailer()).toBeNull();
    process.env.RESEND_API_KEY = 're_test';
    expect(resendMailer()).toBeNull();
    process.env.SUGGESTIONS_TO = 'jess@example.com';
    expect(resendMailer()).not.toBeNull();
    expect(ownerEmail()).toBe('jess@example.com');
  });

  it('posts to Resend with the configured sender and fails on a non-2xx', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.SUGGESTIONS_TO = 'jess@example.com';
    const fetchLike = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
    await resendMailer(fetchLike)!.send({ subject: 'Hi', html: '<b>x</b>' });
    expect(fetchLike).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer re_test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'The Game Room <onboarding@resend.dev>', to: 'jess@example.com', subject: 'Hi', html: '<b>x</b>' }),
    }));

    process.env.SUGGESTIONS_FROM = 'Me <me@example.com>';
    const failing = vi.fn(async () => ({ ok: false, status: 422 }) as Response);
    await expect(resendMailer(failing)!.send({ subject: 'Hi', html: '' })).rejects.toThrow('Resend responded 422');
    expect(JSON.parse((failing.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).from).toBe('Me <me@example.com>');
  });

  it('gives up on a Resend call that never answers', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.SUGGESTIONS_TO = 'jess@example.com';
    const hanging = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    }));
    await expect(resendMailer(hanging, 10)!.send({ subject: 'Hi', html: '' })).rejects.toThrow(/timed out|abort/i);
    // The default send carries a deadline too.
    const fetchLike = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
    await resendMailer(fetchLike)!.send({ subject: 'Hi', html: '' });
    expect((fetchLike.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('resolves the public origin from APP_URL, then Vercel, else throws', () => {
    expect(() => baseUrl()).toThrow('APP_URL');
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'games.vercel.app';
    expect(baseUrl()).toBe('https://games.vercel.app');
    process.env.APP_URL = 'http://localhost:5173/';
    expect(baseUrl()).toBe('http://localhost:5173');
  });

  it('escapes HTML in pages and titles', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
    const html = page('<Title>', '<p>body</p>');
    expect(html).toContain('<title>&lt;Title&gt;</title>');
    expect(html).toContain('<h1>&lt;Title&gt;</h1><p>body</p>');
    expect(html).toContain('name="robots" content="noindex"');
    // The pages' URLs carry emailed tokens; nothing they load may see them.
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(page('T', '', '.x{color:red}')).toContain('.x{color:red}</style>');
    expect(button('https://x', 'Go', '#000')).toContain('href="https://x"');
  });
});
