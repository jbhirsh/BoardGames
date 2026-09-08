import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as Sentry from '@sentry/node';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { enforceRateLimit, getLimiter } from './_lib/rateLimit.js';
import { getRedis } from './_lib/redis.js';
import { SLUG_RE } from './_lib/slug.js';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

// Same display-name shape as the owners endpoint.
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,29}$/u;
const GAME_MIN = 2;
const GAME_MAX = 80;
const NOTE_MAX = 200;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

// Ids that still count for duplicate checks (pending + approved) and ids the
// public list renders (approved). Denied suggestions leave both lists but keep
// their hash so a stale email link can still say "already denied".
const ACTIVE_KEY = 'suggestions:active';
const APPROVED_KEY = 'suggestions:approved';
const itemKey = (id: string) => `suggestions:${id}`;

/**
 * `unsent`: stored, but the send call failed. It leaves the active list so
 * the suggester can retry. Because a timeout can follow a delivery that
 * actually happened, the emailed links still work on an unsent record:
 * deciding it behaves exactly like deciding a pending one.
 */
export type SuggestionStatus = 'pending' | 'approved' | 'denied' | 'unsent';

const decidable = (s: SuggestionStatus) => s === 'pending' || s === 'unsent';

export interface Suggestion {
  id: string;
  game: string;
  name: string;
  note: string;
  status: SuggestionStatus;
  createdAt: number;
  decidedAt?: number;
}

export interface SuggestionsPipeline {
  hgetall(key: string): SuggestionsPipeline;
  exec(): Promise<unknown[]>;
}

export interface SuggestionsRedis {
  hset(key: string, fields: Record<string, string | number>): Promise<number>;
  hgetall(key: string): Promise<Record<string, unknown> | null>;
  lpush(key: string, value: string): Promise<number>;
  lrem(key: string, count: number, value: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  pipeline(): SuggestionsPipeline;
}

export interface Mail {
  subject: string;
  html: string;
}

/** Sends the approval email. Implemented by Resend in production, a spy in tests. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export interface SuggestionsRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface SuggestionsResponse {
  status(code: number): SuggestionsResponse;
  json(data: unknown): SuggestionsResponse;
  setHeader(name: string, value: string): SuggestionsResponse;
  send(body: string): SuggestionsResponse;
}

export interface SuggestionsDeps {
  redis: SuggestionsRedis;
  /** null when email isn't configured: suggestions are then refused, never lost silently. */
  mailer: Mailer | null;
  /** Absolute origin the emailed links point at; only consulted when sending. */
  baseUrl: () => string;
  now?: () => number;
  randomId?: () => string;
  randomToken?: () => string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// The Upstash client JSON-parses hash values, so "1830" comes back as a
// number and "true" as a boolean: coerce rather than reject.
const str = (v: unknown): string | undefined => (v === undefined || v === null ? undefined : String(v));

function parse(hash: unknown): (Suggestion & { token: string }) | null {
  if (!hash || typeof hash !== 'object') return null;
  const h = hash as Record<string, unknown>;
  const id = str(h.id);
  const game = str(h.game);
  const name = str(h.name);
  if (!id || !game || !name) return null;
  const status = str(h.status);
  return {
    id,
    game,
    name,
    note: str(h.note) ?? '',
    status: status === 'approved' || status === 'denied' || status === 'unsent' ? status : 'pending',
    createdAt: Number(h.createdAt) || 0,
    decidedAt: h.decidedAt !== undefined ? Number(h.decidedAt) || 0 : undefined,
    token: str(h.token) ?? '',
  };
}

async function loadList(redis: SuggestionsRedis, key: string): Promise<Array<Suggestion & { token: string }>> {
  const ids = await redis.lrange(key, 0, -1);
  if (ids.length === 0) return [];
  const pipe = redis.pipeline();
  for (const id of ids) pipe.hgetall(itemKey(id));
  const hashes = await pipe.exec();
  return hashes.map(parse).filter((s): s is Suggestion & { token: string } => s !== null);
}

const publicView = ({ id, game, name, note, status, createdAt, decidedAt }: Suggestion): Suggestion =>
  ({ id, game, name, note, status, createdAt, decidedAt });

const PAGE_STYLE = "body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;background:#F5F5F7;color:#1D1D1F;margin:0;padding:48px 20px;text-align:center}main{max-width:420px;margin:0 auto;background:#fff;border-radius:16px;padding:32px 24px;box-shadow:0 1px 3px rgba(0,0,0,.08)}h1{font-size:22px;margin:0 0 12px}p{color:#6E6E73;line-height:1.5;margin:0 0 20px}button{font:inherit;font-weight:600;padding:12px 22px;border-radius:10px;border:0;color:#fff;cursor:pointer}";

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head><body><main><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
}

/**
 * Confirmation step between the emailed link and the decision. A bare GET
 * must not change state: mail link-scanners and preview fetchers follow every
 * URL in a message, so the flip only happens on the POST this form submits.
 */
function confirmPage(s: Suggestion, action: 'approve' | 'deny', token: string): string {
  const verb = action === 'approve' ? 'Approve' : 'Deny';
  const color = action === 'approve' ? '#0071E3' : '#6E6E73';
  return page(
    `${verb} ${s.game}?`,
    `<p>Suggested by ${escapeHtml(s.name)}${s.note ? `: “${escapeHtml(s.note)}”` : ''}</p>` +
    `<form method="post" action="/api/suggestions">` +
    `<input type="hidden" name="decision" value="${action}"><input type="hidden" name="id" value="${escapeHtml(s.id)}"><input type="hidden" name="token" value="${escapeHtml(token)}">` +
    `<button type="submit" style="background:${color}">${verb}</button></form>`,
  );
}

function decisionPage(title: string, body: string): string {
  return page(title, `<p>${body}</p>`);
}

function approvalMail(s: Suggestion, approveUrl: string, denyUrl: string): Mail {
  const note = s.note ? `<p style="margin:0 0 16px;color:#6E6E73">“${escapeHtml(s.note)}”</p>` : '';
  const btn = (href: string, label: string, bg: string) =>
    `<a href="${href}" style="display:inline-block;padding:12px 22px;margin:0 6px 8px;border-radius:10px;background:${bg};color:#fff;text-decoration:none;font-weight:600">${label}</a>`;
  return {
    subject: `Game suggestion: ${s.game} (from ${s.name})`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1D1D1F">
<h2 style="margin:0 0 6px">${escapeHtml(s.game)}</h2>
<p style="margin:0 0 16px;color:#6E6E73">Suggested by <strong>${escapeHtml(s.name)}</strong></p>
${note}
<p style="margin:0 0 20px">Approve it to add it to the wishlist, or deny it to hide it. Either link asks you to confirm.</p>
${btn(approveUrl, 'Approve', '#0071E3')}${btn(denyUrl, 'Deny', '#6E6E73')}
<p style="margin:24px 0 0;font-size:12px;color:#86868B">Only someone with this email can use these links.</p>
</div>`,
  };
}

function tokenMatches(stored: string, given: string): boolean {
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Look up a suggestion for a decision link; writes the error response itself. */
async function authorise(
  redis: SuggestionsRedis,
  id: unknown,
  token: unknown,
  res: SuggestionsResponse,
): Promise<(Suggestion & { token: string }) | null> {
  if (typeof id !== 'string' || typeof token !== 'string' || !SLUG_RE.test(id) || !TOKEN_RE.test(token)) {
    res.status(400).json({ error: 'invalid id or token' });
    return null;
  }
  const item = parse(await redis.hgetall(itemKey(id)));
  if (!item) {
    res.status(404).json({ error: 'suggestion not found' });
    return null;
  }
  if (!tokenMatches(item.token, token)) {
    res.status(403).json({ error: 'invalid token' });
    return null;
  }
  return item;
}

export async function handleSuggestions(
  deps: SuggestionsDeps,
  req: SuggestionsRequest,
  res: SuggestionsResponse,
): Promise<SuggestionsResponse> {
  const { redis, mailer } = deps;
  const now = deps.now ?? (() => Date.now());
  try {
    if (req.method === 'GET') {
      const action = typeof req.query.action === 'string' ? req.query.action : '';

      if (action === '') {
        const approved = await loadList(redis, APPROVED_KEY);
        const items = approved
          .filter((s) => s.status === 'approved')
          .sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0))
          .map(publicView);
        return res.status(200).json({ items });
      }

      if (action !== 'approve' && action !== 'deny') {
        return res.status(400).json({ error: 'unknown action' });
      }
      const item = await authorise(redis, req.query.id, req.query.token, res);
      if (!item) return res;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (!decidable(item.status)) {
        return res.status(200).send(decisionPage(
          `Already ${item.status}`,
          `${escapeHtml(item.game)} was ${item.status} earlier. Nothing changed.`,
        ));
      }
      return res.status(200).send(confirmPage(item, action, req.query.token as string));
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;

      // The confirmation form from a decision link.
      if (body.decision !== undefined) {
        const decision = body.decision;
        if (decision !== 'approve' && decision !== 'deny') {
          return res.status(400).json({ error: 'unknown decision' });
        }
        const item = await authorise(redis, body.id, body.token, res);
        if (!item) return res;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (!decidable(item.status)) {
          return res.status(200).send(decisionPage(
            `Already ${item.status}`,
            `${escapeHtml(item.game)} was ${item.status} earlier. Nothing changed.`,
          ));
        }
        const wanted: SuggestionStatus = decision === 'approve' ? 'approved' : 'denied';
        await redis.hset(itemKey(item.id), { status: wanted, decidedAt: now() });
        if (wanted === 'approved') {
          await redis.lpush(APPROVED_KEY, item.id);
          // An unsent record left the active list; approving it puts it back
          // so the duplicate check sees it again.
          if (item.status === 'unsent') await redis.lpush(ACTIVE_KEY, item.id);
        } else {
          await redis.lrem(ACTIVE_KEY, 0, item.id);
        }
        return res.status(200).send(decisionPage(
          wanted === 'approved' ? 'Approved' : 'Denied',
          wanted === 'approved'
            ? `${escapeHtml(item.game)} is now on the wishlist, credited to ${escapeHtml(item.name)}.`
            : `${escapeHtml(item.game)} won't appear on the wishlist.`,
        ));
      }

      // A new suggestion from the form.
      if (!mailer) {
        return res.status(503).json({ error: 'Suggestions are not open yet' });
      }
      const game = typeof body.game === 'string' ? body.game.trim().replace(/\s+/g, ' ') : '';
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const note = typeof body.note === 'string' ? body.note.trim().replace(/\s+/g, ' ') : '';
      if (game.length < GAME_MIN || game.length > GAME_MAX || /[\p{C}]/u.test(game)) {
        return res.status(400).json({ error: `game must be ${GAME_MIN}–${GAME_MAX} characters` });
      }
      if (!NAME_RE.test(name)) {
        return res.status(400).json({ error: 'name must be 1–30 letters, digits, spaces or basic punctuation' });
      }
      if (note.length > NOTE_MAX || /[\p{C}]/u.test(note)) {
        return res.status(400).json({ error: `note must be at most ${NOTE_MAX} characters` });
      }

      // Read-then-write: two different people suggesting the same game in the
      // same instant can both get through. Accepted; the owner just sees two
      // emails and approves one. A lock isn't worth it at this traffic.
      const active = await loadList(redis, ACTIVE_KEY);
      const dup = active.find((s) => s.status !== 'denied' && normalize(s.game) === normalize(game));
      if (dup) {
        return res.status(409).json({
          error: dup.status === 'approved'
            ? `${dup.game} is already on the wishlist`
            : `${dup.game} has already been suggested and is waiting for approval`,
        });
      }

      const id = (deps.randomId ?? (() => `sug-${randomBytes(6).toString('hex')}`))();
      const token = (deps.randomToken ?? (() => randomBytes(24).toString('base64url')))();
      const item: Suggestion = { id, game, name, note, status: 'pending', createdAt: now() };
      const base = deps.baseUrl().replace(/\/$/, '');
      const link = (action: string) =>
        `${base}/api/suggestions?action=${action}&id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;

      // Store first, then email, so the links in the owner's inbox always
      // resolve. If delivery fails, roll the record back out of the active
      // list so the suggester can retry instead of hitting the duplicate
      // check for a request the owner never received.
      await redis.hset(itemKey(id), { ...item, token });
      await redis.lpush(ACTIVE_KEY, id);
      try {
        await mailer.send(approvalMail(item, link('approve'), link('deny')));
      } catch (err) {
        await redis.lrem(ACTIVE_KEY, 0, id);
        await redis.hset(itemKey(id), { status: 'unsent' });
        throw err;
      }
      return res.status(201).json({ item: publicView(item) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error('suggestions api error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

/** Resend's REST API; null until RESEND_API_KEY and SUGGESTIONS_TO are configured. */
function resendMailer(): Mailer | null {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.SUGGESTIONS_TO;
  if (!key || !to) return null;
  const from = process.env.SUGGESTIONS_FROM || 'The Game Room <onboarding@resend.dev>';
  return {
    async send(mail) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject: mail.subject, html: mail.html }),
      });
      if (!r.ok) throw new Error(`Resend responded ${r.status}`);
    },
  };
}

function baseUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  throw new Error('APP_URL or VERCEL_PROJECT_PRODUCTION_URL must be set');
}

// Each new suggestion sends the owner an email, so creation is bounded
// tightly per IP. Reads and the token-gated decision form are unlimited.
const suggestLimiter = getLimiter('suggestions', 5, 3600);

function isCreate(req: VercelRequest): boolean {
  const body = req.body as Record<string, unknown> | undefined;
  return req.method === 'POST' && body?.decision === undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (isCreate(req) && !(await enforceRateLimit(suggestLimiter, req, res))) return;
  await handleSuggestions({ redis: getRedis(), mailer: resendMailer(), baseUrl }, req, res);
}
