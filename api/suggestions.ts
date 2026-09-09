import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as Sentry from '@sentry/node';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { enforceRateLimit, getLimiter } from './_lib/rateLimit.js';
import { getRedis } from './_lib/redis.js';
import { lookupGame, type GameDetails } from './_lib/bgg.js';
import { SLUG_RE } from './_lib/slug.js';
import { baseUrl, button, escapeHtml, page, resendMailer, type Mail, type Mailer } from './_lib/mail.js';
import { isAdmin, isJsonRequest, type Headers } from './_lib/session.js';

export type { Mail, Mailer } from './_lib/mail.js';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

// Same display-name shape as the client's utils/displayName.ts.
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
// Records whose approval email failed to send: off the active list (so the
// suggester can retry) but kept here so the owner's queue still shows them.
const UNSENT_KEY = 'suggestions:unsent';
const itemKey = (id: string) => `suggestions:${id}`;

/**
 * `unsent`: stored, but the send call failed. It leaves the active list so
 * the suggester can retry. Because a timeout can follow a delivery that
 * actually happened, the emailed links still work on an unsent record:
 * deciding it behaves exactly like deciding a pending one.
 * `removed`: the owner took an approved game off the wishlist.
 */
export type SuggestionStatus = 'pending' | 'approved' | 'denied' | 'unsent' | 'removed';

const decidable = (s: SuggestionStatus) => s === 'pending' || s === 'unsent';

// Lists the client also has (src/data/keywords.ts): the two trees can't
// import each other, so these are mirrored by hand and tests keep them in step.
/** Wishlist sections the owner can file a game under (WISHLIST_SECTIONS on the client). */
export const WISHLIST_SECTION_IDS = ['party', 'strategy', 'coop', 'two-player', 'heavy'] as const;
/** The keyword ids the client knows (KW on the client). */
export const KEYWORD_IDS = [
  'social', 'bluffing', 'deduction', 'strategy', 'negotiation', 'abstract', 'deck-building', 'cooperative',
  'team', 'party', 'adult', 'active', 'creative', 'card-game', 'word', 'family', 'classic', 'thematic',
  'portable', 'quick-play',
] as const;
const DESC_MAX = 600;
const MINS_MAX = 600;
const PLAYERS_MAX = 99;
const KW_MAX = 20;

/** Details filled in from BoardGameGeek on approval, editable by the owner. */
export interface SuggestionDetails {
  bggId?: number;
  year?: number;
  min: number;
  max: number;
  mins: number;
  desc: string;
  kw: string[];
  /** Wishlist section chosen by the owner; absent means "Suggested by friends". */
  type?: (typeof WISHLIST_SECTION_IDS)[number];
  /** Box-art thumbnail from BoardGameGeek; set by the lookup, never by an edit. */
  img?: string;
}

export interface Suggestion {
  id: string;
  game: string;
  name: string;
  note: string;
  status: SuggestionStatus;
  createdAt: number;
  decidedAt?: number;
  details?: SuggestionDetails;
  /** Who put it on the list: a friend's suggestion, or the owner directly. */
  source: 'friend' | 'owner';
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

export interface SuggestionsRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers?: Headers;
}

export interface SuggestionsResponse {
  status(code: number): SuggestionsResponse;
  json(data: unknown): SuggestionsResponse;
  setHeader(name: string, value: string): SuggestionsResponse;
  send(body: string): SuggestionsResponse;
}

export interface SuggestionsDeps {
  redis: SuggestionsRedis;
  /** Fills in players, time, description and keywords on approval; null skips enrichment. */
  lookup?: ((name: string) => Promise<GameDetails | null>) | null;
  /** null when email isn't configured: suggestions are then refused, never lost silently. */
  mailer: Mailer | null;
  /** Absolute origin the emailed links point at; only consulted when sending. */
  baseUrl: () => string;
  /** Whether the request carries a live owner session; absent means never. */
  admin?: (req: SuggestionsRequest) => Promise<boolean>;
  now?: () => number;
  randomId?: () => string;
  randomToken?: () => string;
}

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
    status: status === 'approved' || status === 'denied' || status === 'unsent' || status === 'removed' ? status : 'pending',
    createdAt: Number(h.createdAt) || 0,
    decidedAt: h.decidedAt !== undefined ? Number(h.decidedAt) || 0 : undefined,
    details: parseDetails(h.details),
    source: str(h.source) === 'owner' ? 'owner' : 'friend',
    token: str(h.token) ?? '',
  };
}

const isWishlistType = (v: unknown): v is SuggestionDetails['type'] =>
  typeof v === 'string' && (WISHLIST_SECTION_IDS as readonly string[]).includes(v);

// Details are stored as one JSON field; the client may hand it back parsed.
function parseDetails(raw: unknown): SuggestionDetails | undefined {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return undefined; }
  }
  if (!v || typeof v !== 'object') return undefined;
  const d = v as Record<string, unknown>;
  const n = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
  return {
    bggId: typeof d.bggId === 'number' ? d.bggId : undefined,
    year: typeof d.year === 'number' ? d.year : undefined,
    min: n(d.min, 1),
    max: n(d.max, 99),
    mins: n(d.mins, 0),
    desc: typeof d.desc === 'string' ? d.desc : '',
    kw: Array.isArray(d.kw) ? d.kw.filter((k): k is string => typeof k === 'string') : [],
    type: isWishlistType(d.type) ? d.type : undefined,
    img: typeof d.img === 'string' && /^https:\/\/\S+$/.test(d.img) ? d.img : undefined,
  };
}

/**
 * The owner's edits, validated field by field against the stored details.
 * Returns the merged details or the first problem.
 */
function mergeDetails(current: SuggestionDetails | undefined, raw: unknown): { ok: true; details: SuggestionDetails } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'details must be an object' };
  const d = raw as Record<string, unknown>;
  const base: SuggestionDetails = current ?? { min: 1, max: PLAYERS_MAX, mins: 0, desc: '', kw: [] };
  const int = (v: unknown, lo: number, hi: number, fallback: number): number | null =>
    v === undefined ? fallback : typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
  const min = int(d.min, 1, PLAYERS_MAX, base.min);
  const max = int(d.max, 1, PLAYERS_MAX, base.max);
  const mins = int(d.mins, 0, MINS_MAX, base.mins);
  if (min === null || max === null || min > max) return { ok: false, error: `players must be whole numbers from 1 to ${PLAYERS_MAX}, min at most max` };
  if (mins === null) return { ok: false, error: `minutes must be a whole number from 0 to ${MINS_MAX}` };
  let desc = base.desc;
  if (d.desc !== undefined) {
    // Normalise first: the edit form's textarea sends newlines, which are
    // whitespace to collapse, not control characters to refuse.
    const clean = typeof d.desc === 'string' ? d.desc.trim().replace(/\s+/g, ' ') : null;
    if (clean === null || clean.length > DESC_MAX || /[\p{C}]/u.test(clean)) return { ok: false, error: `description must be at most ${DESC_MAX} characters` };
    desc = clean;
  }
  let kw = base.kw;
  if (d.kw !== undefined) {
    if (!Array.isArray(d.kw) || d.kw.length > KW_MAX || !d.kw.every((k) => (KEYWORD_IDS as readonly unknown[]).includes(k))) return { ok: false, error: 'keywords must be a short list of keyword ids' };
    kw = [...new Set(d.kw as string[])];
  }
  let type = base.type;
  if (d.type !== undefined) {
    if (d.type !== null && !isWishlistType(d.type)) return { ok: false, error: 'unknown wishlist type' };
    type = d.type === null ? undefined : d.type;
  }
  return { ok: true, details: { bggId: base.bggId, year: base.year, img: base.img, min, max, mins, desc, kw, type } };
}

async function loadList(redis: SuggestionsRedis, key: string): Promise<Array<Suggestion & { token: string }>> {
  const ids = await redis.lrange(key, 0, -1);
  if (ids.length === 0) return [];
  const pipe = redis.pipeline();
  for (const id of ids) pipe.hgetall(itemKey(id));
  const hashes = await pipe.exec();
  return hashes.map(parse).filter((s): s is Suggestion & { token: string } => s !== null);
}

const publicView = ({ id, game, name, note, status, createdAt, decidedAt, details, source }: Suggestion): Suggestion =>
  ({ id, game, name, note, status, createdAt, decidedAt, details, source });

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
  const btn = button;
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

/**
 * Owner-only requests: a live session, and for anything that mutates, a
 * JSON body (the CSRF check; see isJsonRequest). Writes the 403 itself.
 */
async function requireAdmin(deps: SuggestionsDeps, req: SuggestionsRequest, res: SuggestionsResponse, mutation = true): Promise<boolean> {
  const headers = req.headers ?? {};
  if (mutation && !isJsonRequest(headers)) {
    res.status(403).json({ error: 'owner actions must be sent as JSON' });
    return false;
  }
  if (!deps.admin || !(await deps.admin(req))) {
    res.status(403).json({ error: 'owner sign-in required' });
    return false;
  }
  return true;
}

/** Look up an item by id for an owner action; writes the error response itself. */
async function loadItem(redis: SuggestionsRedis, id: unknown, res: SuggestionsResponse): Promise<(Suggestion & { token: string }) | null> {
  if (typeof id !== 'string' || !SLUG_RE.test(id)) {
    res.status(400).json({ error: 'invalid id' });
    return null;
  }
  const item = parse(await redis.hgetall(itemKey(id)));
  if (!item) res.status(404).json({ error: 'suggestion not found' });
  return item;
}

/**
 * Fill in players, time, description and keywords from BoardGameGeek so the
 * card looks like every other wishlist entry. Callers list the game first,
 * so a slow lookup can never strand it off the list. Best effort: a miss or
 * an outage leaves the details as they are.
 */
async function enrich(deps: SuggestionsDeps, item: Suggestion, extra: Partial<SuggestionDetails> = {}): Promise<void> {
  let details: SuggestionDetails | undefined;
  if (deps.lookup) {
    try {
      const found = await deps.lookup(item.game);
      if (found) {
        details = { bggId: found.bggId, year: found.year, img: found.img, min: found.min, max: found.max, mins: found.mins, desc: found.desc, kw: found.kw };
      }
    } catch (err) {
      Sentry.captureException(err);
      console.error('suggestions: BoardGameGeek lookup failed', err);
    }
  }
  if (!details && extra.type) details = { min: 1, max: PLAYERS_MAX, mins: 0, desc: '', kw: [] };
  if (details) await deps.redis.hset(itemKey(item.id), { details: JSON.stringify({ ...details, ...extra }) });
}

/** Flip a decidable suggestion; the caller has already checked it can be decided. */
async function decide(deps: SuggestionsDeps, item: Suggestion, wanted: 'approved' | 'denied', now: () => number): Promise<void> {
  const { redis } = deps;
  await redis.hset(itemKey(item.id), { status: wanted, decidedAt: now() });
  if (item.status === 'unsent') await redis.lrem(UNSENT_KEY, 0, item.id);
  if (wanted === 'approved') {
    await redis.lpush(APPROVED_KEY, item.id);
    // An unsent record left the active list; approving it puts it back
    // so the duplicate check sees it again.
    if (item.status === 'unsent') await redis.lpush(ACTIVE_KEY, item.id);
    await enrich(deps, item);
  } else {
    await redis.lrem(ACTIVE_KEY, 0, item.id);
  }
}

function validateGame(v: unknown): { ok: true; game: string } | { ok: false; error: string } {
  const game = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (game.length < GAME_MIN || game.length > GAME_MAX || /[\p{C}]/u.test(game)) {
    return { ok: false, error: `game must be ${GAME_MIN}–${GAME_MAX} characters` };
  }
  return { ok: true, game };
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

      // The owner's queue: everything still waiting on a decision, including
      // the ones whose email never went out.
      if (action === 'pending') {
        if (!(await requireAdmin(deps, req, res, false))) return res;
        const waiting = [...(await loadList(redis, ACTIVE_KEY)), ...(await loadList(redis, UNSENT_KEY))];
        const seen = new Set<string>();
        const items = waiting
          .filter((s) => decidable(s.status) && !seen.has(s.id) && seen.add(s.id))
          .sort((a, b) => b.createdAt - a.createdAt)
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

      // A decision: from the emailed link's confirmation form (token), or
      // from the signed-in owner on the site (session, JSON).
      if (body.decision !== undefined) {
        const decision = body.decision;
        if (decision !== 'approve' && decision !== 'deny') {
          return res.status(400).json({ error: 'unknown decision' });
        }
        const wanted = decision === 'approve' ? 'approved' : 'denied';

        if (body.token === undefined) {
          if (!(await requireAdmin(deps, req, res))) return res;
          const item = await loadItem(redis, body.id, res);
          if (!item) return res;
          if (!decidable(item.status)) {
            return res.status(409).json({ error: `${item.game} was already ${item.status}` });
          }
          await decide(deps, item, wanted, now);
          const updated = parse(await redis.hgetall(itemKey(item.id)));
          return res.status(200).json({ item: updated ? publicView(updated) : null });
        }

        const item = await authorise(redis, body.id, body.token, res);
        if (!item) return res;

        if (!decidable(item.status)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.status(200).send(decisionPage(
            `Already ${item.status}`,
            `${escapeHtml(item.game)} was ${item.status} earlier. Nothing changed.`,
          ));
        }
        await decide(deps, item, wanted, now);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(decisionPage(
          wanted === 'approved' ? 'Approved' : 'Denied',
          wanted === 'approved'
            ? `${escapeHtml(item.game)} is now on the wishlist, credited to ${escapeHtml(item.name)}.`
            : `${escapeHtml(item.game)} won't appear on the wishlist.`,
        ));
      }

      // The owner adding a game straight to the wishlist: stored approved,
      // no email, enriched the same way an approved suggestion is.
      if (body.action === 'add') {
        if (!(await requireAdmin(deps, req, res))) return res;
        const g = validateGame(body.game);
        if (!g.ok) return res.status(400).json({ error: g.error });
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!NAME_RE.test(name)) {
          return res.status(400).json({ error: 'name must be 1–30 letters, digits, spaces or basic punctuation' });
        }
        const note = typeof body.note === 'string' ? body.note.trim().replace(/\s+/g, ' ') : '';
        if (note.length > NOTE_MAX || /[\p{C}]/u.test(note)) {
          return res.status(400).json({ error: `note must be at most ${NOTE_MAX} characters` });
        }
        if (body.type !== undefined && !isWishlistType(body.type)) {
          return res.status(400).json({ error: 'unknown wishlist type' });
        }
        const active = await loadList(redis, ACTIVE_KEY);
        const dup = active.find((s) => normalize(s.game) === normalize(g.game));
        if (dup) return res.status(409).json({ error: `${dup.game} is already on the list` });

        const id = (deps.randomId ?? (() => `sug-${randomBytes(6).toString('hex')}`))();
        const token = (deps.randomToken ?? (() => randomBytes(24).toString('base64url')))();
        const at = now();
        const item: Suggestion = { id, game: g.game, name, note, status: 'approved', createdAt: at, decidedAt: at, source: 'owner' };
        await redis.hset(itemKey(id), { id, game: g.game, name, note, status: 'approved', createdAt: at, decidedAt: at, source: 'owner', token });
        await redis.lpush(ACTIVE_KEY, id);
        await redis.lpush(APPROVED_KEY, id);
        await enrich(deps, item, body.type !== undefined ? { type: body.type } : {});
        const stored = parse(await redis.hgetall(itemKey(id)));
        return res.status(201).json({ item: stored ? publicView(stored) : publicView(item) });
      }

      if (body.action !== undefined) {
        return res.status(400).json({ error: 'unknown action' });
      }

      // A new suggestion from the form.
      if (!mailer) {
        return res.status(503).json({ error: 'Suggestions are not open yet' });
      }
      const g = validateGame(body.game);
      if (!g.ok) return res.status(400).json({ error: g.error });
      const game = g.game;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const note = typeof body.note === 'string' ? body.note.trim().replace(/\s+/g, ' ') : '';
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
      const item: Suggestion = { id, game, name, note, status: 'pending', createdAt: now(), source: 'friend' };
      const link = (action: string) =>
        `${deps.baseUrl()}/api/suggestions?action=${action}&id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;

      // Store first, then email, so the links in the owner's inbox always
      // resolve. If delivery fails, roll the record back out of the active
      // list so the suggester can retry instead of hitting the duplicate
      // check for a request the owner never received.
      await redis.hset(itemKey(id), { id, game, name, note, status: 'pending', createdAt: item.createdAt, token });
      await redis.lpush(ACTIVE_KEY, id);
      try {
        await mailer.send(approvalMail(item, link('approve'), link('deny')));
      } catch (err) {
        await redis.lrem(ACTIVE_KEY, 0, id);
        await redis.hset(itemKey(id), { status: 'unsent' });
        await redis.lpush(UNSENT_KEY, id);
        throw err;
      }
      return res.status(201).json({ item: publicView(item) });
    }

    // The owner editing how an approved game reads on the wishlist.
    if (req.method === 'PATCH') {
      if (!(await requireAdmin(deps, req, res))) return res;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const item = await loadItem(redis, body.id, res);
      if (!item) return res;
      if (item.status === 'removed' || item.status === 'denied') {
        return res.status(409).json({ error: `${item.game} is not on the wishlist` });
      }
      const fields: Record<string, string | number> = {};
      if (body.game !== undefined) {
        const g = validateGame(body.game);
        if (!g.ok) return res.status(400).json({ error: g.error });
        fields.game = g.game;
      }
      if (body.note !== undefined) {
        const note = typeof body.note === 'string' ? body.note.trim().replace(/\s+/g, ' ') : null;
        if (note === null || note.length > NOTE_MAX || /[\p{C}]/u.test(note)) {
          return res.status(400).json({ error: `note must be at most ${NOTE_MAX} characters` });
        }
        fields.note = note;
      }
      if (body.details !== undefined) {
        const merged = mergeDetails(item.details, body.details);
        if (!merged.ok) return res.status(400).json({ error: merged.error });
        fields.details = JSON.stringify(merged.details);
      }
      if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'nothing to change' });
      await redis.hset(itemKey(item.id), fields);
      const updated = parse(await redis.hgetall(itemKey(item.id)));
      return res.status(200).json({ item: updated ? publicView(updated) : null });
    }

    // The owner taking a game off the wishlist. The hash stays so old
    // links and ids still resolve; only the lists forget it.
    if (req.method === 'DELETE') {
      if (!(await requireAdmin(deps, req, res))) return res;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const item = await loadItem(redis, body.id, res);
      if (!item) return res;
      // Only what is on the wishlist can come off it; a pending suggestion
      // is denied through decide(), which keeps the queue's bookkeeping.
      if (item.status !== 'approved') {
        return res.status(409).json({ error: `${item.game} is not on the wishlist` });
      }
      await redis.lrem(APPROVED_KEY, 0, item.id);
      await redis.lrem(ACTIVE_KEY, 0, item.id);
      await redis.hset(itemKey(item.id), { status: 'removed', decidedAt: now() });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error('suggestions api error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Each new suggestion sends the owner an email, so creation is bounded
// tightly per IP. Reads and the token-gated decision form are unlimited.
const suggestLimiter = getLimiter('suggestions', 5, 3600);

function isCreate(req: VercelRequest): boolean {
  const body = req.body as Record<string, unknown> | undefined;
  return req.method === 'POST' && body?.decision === undefined && body?.action === undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (isCreate(req) && !(await enforceRateLimit(suggestLimiter, req, res))) return;
  const redis = getRedis();
  await handleSuggestions({
    redis,
    mailer: resendMailer(),
    baseUrl,
    lookup: (name) => lookupGame(name, fetch, 6000, process.env.BGG_API_TOKEN),
    admin: (r) => isAdmin(redis, r.headers ?? {}),
  }, req, res);
}
