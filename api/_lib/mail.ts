// Outbound email shared by the suggestion approvals and the owner sign-in
// link: one Resend wiring, one place the app's public origin is resolved.

export interface Mail {
  subject: string;
  html: string;
}

/** Sends one email to the owner. Implemented by Resend in production, a spy in tests. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** The owner's address: where approvals go and the only address that can sign in. */
export function ownerEmail(): string | null {
  return process.env.SUGGESTIONS_TO || null;
}

// Long enough for a slow Resend, short enough that a hung one fails inside
// the function's own time limit: the caller's error path (a suggestion marked
// unsent so it can be retried) only runs if the send gives up first.
const RESEND_TIMEOUT_MS = 5000;

/** Resend's REST API; null until RESEND_API_KEY and SUGGESTIONS_TO are configured. */
export function resendMailer(fetchLike: typeof fetch = fetch, timeoutMs = RESEND_TIMEOUT_MS): Mailer | null {
  const key = process.env.RESEND_API_KEY;
  const to = ownerEmail();
  if (!key || !to) return null;
  const from = process.env.SUGGESTIONS_FROM || 'The Game Room <onboarding@resend.dev>';
  return {
    async send(mail) {
      const r = await fetchLike('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject: mail.subject, html: mail.html }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) throw new Error(`Resend responded ${r.status}`);
    },
  };
}

/** Absolute origin the emailed links point at, without a trailing slash. */
export function baseUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  throw new Error('APP_URL or VERCEL_PROJECT_PRODUCTION_URL must be set');
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export { escapeHtml };

export const PAGE_STYLE = "body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;background:#F5F5F7;color:#1D1D1F;margin:0;padding:48px 20px;text-align:center}main{max-width:420px;margin:0 auto;background:#fff;border-radius:16px;padding:32px 24px;box-shadow:0 1px 3px rgba(0,0,0,.08)}h1{font-size:22px;margin:0 0 12px}p{color:#6E6E73;line-height:1.5;margin:0 0 20px}button{font:inherit;font-weight:600;padding:12px 22px;border-radius:10px;border:0;color:#fff;cursor:pointer}";

/**
 * A small standalone page for the steps that happen outside the app (email
 * links); `style` adds rules for what only that page shows. No referrer:
 * these pages' URLs carry the emailed tokens, and the approval page loads
 * box art from BoardGameGeek's image CDN.
 */
export function page(title: string, body: string, style = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>${PAGE_STYLE}${style}</style></head><body><main><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
}

/**
 * The shell both emails share: a narrow column in the app's type and colours,
 * closed by a small grey footnote. Inline styles only, since many mail clients
 * ignore a <style> block.
 */
export function mailLayout(body: string, footnote: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1D1D1F">
${body}
<p style="margin:24px 0 0;font-size:12px;color:#86868B">${footnote}</p>
</div>`;
}

export const button = (href: string, label: string, bg: string) =>
  `<a href="${href}" style="display:inline-block;padding:12px 22px;margin:0 6px 8px;border-radius:10px;background:${bg};color:#fff;text-decoration:none;font-weight:600">${label}</a>`;
