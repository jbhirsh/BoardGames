import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as Sentry from '@sentry/node';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { enforceRateLimit, getLimiter } from './_lib/rateLimit.js';
import { getRawRedis } from './_lib/redis.js';
import { failWith500, initSentry, reportError } from './_lib/sentry.js';
import { lookupGame, type LookupResult } from './_lib/bgg.js';
import { SLUG_RE, isSuggestionId } from './_lib/slug.js';
import { baseUrl, button, escapeHtml, mailLayout, page, resendMailer, type Mail, type Mailer } from './_lib/mail.js';
import { isAdmin, isJsonRequest, type Headers } from './_lib/session.js';

export type { Mail, Mailer } from './_lib/mail.js';

initSentry();

// Friends' game suggestions, approved by the owner by email or on the site.
//
// POST validates a suggestion, stores it as `pending`, then emails the owner
// (Resend) approve and deny links carrying a per-suggestion token: stored
// first, so the emailed links always resolve. A send that fails (or passes
// its timeout) takes the record off the active list and marks it `unsent`,
// so the suggester can retry; its links keep working, since a timeout can
// follow a real delivery, it still shows in the owner's queue, and
// approving it returns it to the active list. With no Resend configuration
// it answers 503 rather than store a suggestion the owner would never see.
//
// GET ?action=approve|deny&id&token checks the token and renders a
// confirmation page whose form POSTs { decision, id, token }: a bare GET
// never changes anything, because mail link-scanners follow every URL. A
// bad link, on either step, gets a standalone page with its 400, 404 or
// 403, not JSON. Plain GET lists the approved suggestions, which the
// wishlist shows under "Suggested by friends".
//
// A signed-in owner (auth.ts) can also work the list from the site: GET
// ?action=pending lists the queue, POST { decision, id } without a token
// decides one, POST { action: 'add', game, name, note?, type? } puts a game
// straight on the wishlist (approved, `source: 'owner'`), PATCH { id, game?,
// note?, details? } edits how an entry reads, and DELETE { id } takes it off
// (status `removed`, the hash kept, the lists forgetting it). Every owner
// mutation must be a JSON request (isJsonRequest, the CSRF layer behind the
// session cookie's SameSite=Lax).
//
// Redis keeps one hash per suggestion and the id lists below, read through
// getRawRedis() so a game called "null" stays that. A decision first claims
// the record (decide), so a double-submitted form, or the email link and the
// site at once, decides it once; its writes go through one MULTI/EXEC, and a
// push removes the id first, so no list holds it twice. On approval (or an owner's add) the game is looked up on
// BoardGameGeek (_lib/bgg.ts) for players, time, a two-sentence
// description, year, keywords and box art, stored as `details` so the entry
// renders and filters like any other; a miss, an outage or no token still
// approves, with details empty. With no BGG_API_TOKEN, BGG isn't called at
// all, and that or BGG refusing the token goes to Sentry as an error, so a
// missing token can't pass for "no match". handleSuggestions() takes { redis, mailer,
// baseUrl, lookup, admin } so tests pass spies.

// Same display-name shape as the client's utils/displayName.ts. It and the
// bounds below are mirrored by the client's forms (src/data/suggestionLimits.ts),
// which tests keep in step.
export const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,29}$/u;
export const GAME_MIN = 2;
export const GAME_MAX = 80;
export const NOTE_MAX = 200;
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
// How long a decision's claim may stand without the decision landing.
const STALE_CLAIM_MS = 60_000;

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
export const DESC_MAX = 600;
export const MINS_MAX = 600;
export const PLAYERS_MAX = 99;
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

/** MULTI/EXEC: the queued writes land together or not at all. */
export interface SuggestionsTransaction {
  hset(key: string, fields: Record<string, string | number>): SuggestionsTransaction;
  lpush(key: string, value: string): SuggestionsTransaction;
  lrem(key: string, count: number, value: string): SuggestionsTransaction;
  exec(): Promise<unknown[]>;
}

/**
 * The handler reads through a client that skips Upstash's JSON parsing (see
 * getRawRedis), so HGETALL answers a flat [field, value, ...] list of strings.
 */
export interface SuggestionsRedis {
  hset(key: string, fields: Record<string, string | number>): Promise<number>;
  hgetall(key: string): Promise<unknown>;
  hsetnx(key: string, field: string, value: string | number): Promise<number>;
  hdel(key: string, field: string): Promise<number>;
  lpush(key: string, value: string): Promise<number>;
  lrem(key: string, count: number, value: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  pipeline(): SuggestionsPipeline;
  multi(): SuggestionsTransaction;
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
  /** Fills in players, time, description and keywords on approval, or says why not; null skips enrichment. */
  lookup?: ((name: string) => Promise<LookupResult>) | null;
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

// Values come back exactly as stored, so a game called "null" or "1.50"
// reads as that text; a missing hash is an empty list.
function fields(raw: unknown): Record<string, string> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const h: Record<string, string> = {};
  for (let i = 0; i + 1 < raw.length; i += 2) h[String(raw[i])] = String(raw[i + 1]);
  return h;
}

function parse(hash: unknown): (Suggestion & { token: string }) | null {
  const h = fields(hash);
  if (!h) return null;
  const { id, game, name, status } = h;
  if (!id || !game || !name) return null;
  return {
    id,
    game,
    name,
    note: h.note ?? '',
    status: status === 'approved' || status === 'denied' || status === 'unsent' || status === 'removed' ? status : 'pending',
    createdAt: Number(h.createdAt) || 0,
    decidedAt: h.decidedAt !== undefined ? Number(h.decidedAt) || 0 : undefined,
    details: parseDetails(h.details),
    source: h.source === 'owner' ? 'owner' : 'friend',
    token: h.token ?? '',
  };
}

const isWishlistType = (v: unknown): v is SuggestionDetails['type'] =>
  typeof v === 'string' && (WISHLIST_SECTION_IDS as readonly string[]).includes(v);

// Details are stored as one JSON field.
function parseDetails(raw: string | undefined): SuggestionDetails | undefined {
  if (raw === undefined) return undefined;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return undefined; }
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
  // Writes never list an id twice; deduping here keeps a stray repeat from
  // showing a game twice all the same.
  const ids = [...new Set(await redis.lrange(key, 0, -1))];
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
  return {
    subject: `Game suggestion: ${s.game} (from ${s.name})`,
    html: mailLayout(`<h2 style="margin:0 0 6px">${escapeHtml(s.game)}</h2>
<p style="margin:0 0 16px;color:#6E6E73">Suggested by <strong>${escapeHtml(s.name)}</strong></p>
${note}
<p style="margin:0 0 20px">Approve it to add it to the wishlist, or deny it to hide it. Either link asks you to confirm.</p>
${button(approveUrl, 'Approve', '#0071E3')}${button(denyUrl, 'Deny', '#6E6E73')}`, 'Only someone with this email can use these links.'),
  };
}

function tokenMatches(stored: string, given: string): boolean {
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Look up a suggestion for a decision link; writes the error response itself.
 * The link and its confirmation form open in a browser, so a bad link gets a
 * page a person can read, not JSON.
 */
async function authorise(
  redis: SuggestionsRedis,
  id: unknown,
  token: unknown,
  res: SuggestionsResponse,
): Promise<(Suggestion & { token: string }) | null> {
  const fail = (code: number, title: string, body: string) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(code).send(decisionPage(title, body));
    return null;
  };
  if (typeof id !== 'string' || typeof token !== 'string' || !SLUG_RE.test(id) || !isSuggestionId(id) || !TOKEN_RE.test(token)) {
    return fail(400, 'Link not recognised', 'This link is incomplete or mistyped. Open it again from the email.');
  }
  const item = parse(await redis.hgetall(itemKey(id)));
  if (!item) {
    return fail(404, 'Suggestion not found', 'There is no suggestion behind this link any more.');
  }
  if (!tokenMatches(item.token, token)) {
    return fail(403, 'Link not valid', 'This link does not match the suggestion. Open it again from the email.');
  }
  return item;
}

/**
 * Owner-only requests: a live session, and for anything that mutates, a
 * JSON body (a CSRF layer behind SameSite; see isJsonRequest). Writes the 403 itself.
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
  if (typeof id !== 'string' || !SLUG_RE.test(id) || !isSuggestionId(id)) {
    res.status(400).json({ error: 'invalid id' });
    return null;
  }
  const item = parse(await redis.hgetall(itemKey(id)));
  if (!item) res.status(404).json({ error: 'suggestion not found' });
  return item;
}

/**
 * Run the BoardGameGeek lookup; never throws. A missing or refused token is
 * the owner's to fix and would otherwise read as "no match" on every game,
 * so it goes to Sentry as an error naming BGG_API_TOKEN (never its value).
 * A failure with an exception behind it (network, timeout, a throwing
 * lookup) is captured too; a plain miss is not an error.
 */
async function lookUp(deps: SuggestionsDeps, game: string): Promise<LookupResult | null> {
  if (!deps.lookup) return null;
  let result: LookupResult;
  try {
    result = await deps.lookup(game);
  } catch (err) {
    result = { outcome: 'unavailable', cause: err };
  }
  if (result.outcome === 'no-token') {
    await reportError('suggestions: BoardGameGeek lookup skipped', new Error('BGG_API_TOKEN is not set, so BoardGameGeek lookups are skipped and new wishlist games get no details'));
  } else if (result.outcome === 'refused') {
    await reportError('suggestions: BoardGameGeek lookup refused', new Error(`BoardGameGeek refused BGG_API_TOKEN (HTTP ${result.status}), so new wishlist games get no details`));
  } else if (result.outcome === 'unavailable' && result.cause !== undefined) {
    Sentry.captureException(result.cause);
    console.error('suggestions: BoardGameGeek lookup failed', result.cause);
  }
  return result;
}

/**
 * Fill in players, time, description and keywords from BoardGameGeek so the
 * card looks like every other wishlist entry. Callers list the game first,
 * so a slow lookup can never strand it off the list. Best effort: a miss or
 * an outage leaves the details as they are.
 */
async function enrich(deps: SuggestionsDeps, item: Suggestion, extra: Partial<SuggestionDetails> = {}): Promise<void> {
  const result = await lookUp(deps, item.game);
  let details: SuggestionDetails | undefined;
  if (result?.outcome === 'found') {
    const found = result.details;
    details = { bggId: found.bggId, year: found.year, img: found.img, min: found.min, max: found.max, mins: found.mins, desc: found.desc, kw: found.kw };
  }
  if (!details && extra.type) details = { min: 1, max: PLAYERS_MAX, mins: 0, desc: '', kw: [] };
  if (details) await deps.redis.hset(itemKey(item.id), { details: JSON.stringify({ ...details, ...extra }) });
}

/**
 * Flip a suggestion the caller has seen as decidable. Two requests can both
 * see it so (a double-clicked confirm form, or the email link and the site at
 * once), so the first claims it and the other gets false: only one flips the
 * status, touches the lists and runs the lookup.
 */
async function decide(deps: SuggestionsDeps, item: Suggestion, wanted: 'approved' | 'denied', now: () => number): Promise<boolean> {
  const { redis } = deps;
  const key = itemKey(item.id);
  const at = now();
  // Only a decision ever sets decidedAt, so a decidable record has none and
  // HSETNX on it is an atomic claim.
  if (!(await redis.hsetnx(key, 'decidedAt', at))) {
    // A claim whose decision never landed (the function died between claim
    // and write, or giving it back failed) would block the record for good,
    // so one that is still undecided a minute on is abandoned: take it over.
    const current = parse(await redis.hgetall(key));
    if (!current?.decidedAt || !decidable(current.status) || at - current.decidedAt < STALE_CLAIM_MS) return false;
    // Two requests can find the same abandoned claim, so taking it over is a
    // claim of its own: HSETNX on a field named for that claim lets one win.
    if (!(await redis.hsetnx(key, `takeover:${current.decidedAt}`, at))) return false;
    await redis.hset(key, { decidedAt: at });
  }
  const tx = redis.multi().hset(key, { status: wanted, decidedAt: at });
  if (item.status === 'unsent') tx.lrem(UNSENT_KEY, 0, item.id);
  if (wanted === 'approved') {
    // Each push removes the id first, so a list can never hold it twice.
    tx.lrem(APPROVED_KEY, 0, item.id).lpush(APPROVED_KEY, item.id);
    // An unsent record left the active list; approving it puts it back
    // so the duplicate check sees it again.
    if (item.status === 'unsent') tx.lrem(ACTIVE_KEY, 0, item.id).lpush(ACTIVE_KEY, item.id);
  } else {
    tx.lrem(ACTIVE_KEY, 0, item.id);
  }
  try {
    await tx.exec();
  } catch (err) {
    // Give the claim back so the decision can be retried.
    await redis.hdel(key, 'decidedAt');
    throw err;
  }
  if (wanted === 'approved') await enrich(deps, item);
  return true;
}

/** What a request that lost the claim reports: the winner's status, once it has landed. */
async function settledStatus(redis: SuggestionsRedis, id: string): Promise<string> {
  const current = parse(await redis.hgetall(itemKey(id)));
  return current && !decidable(current.status) ? current.status : 'decided';
}

const alreadyPage = (game: string, status: string) =>
  decisionPage(`Already ${status}`, `${escapeHtml(game)} was ${status} earlier. Nothing changed.`);

const NAME_ERROR = 'name must be 1–30 letters, digits, spaces or basic punctuation';
const NOTE_ERROR = `note must be at most ${NOTE_MAX} characters`;

/** The trimmed display name, or null when it doesn't fit NAME_RE; anything but a string fails. */
function checkName(v: unknown): string | null {
  const name = typeof v === 'string' ? v.trim() : '';
  return NAME_RE.test(name) ? name : null;
}

/**
 * The note with its whitespace collapsed, or null when it is too long or
 * holds control characters; anything but a string reads as no note.
 */
function cleanNote(v: unknown): string | null {
  const note = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  return note.length > NOTE_MAX || /[\p{C}]/u.test(note) ? null : note;
}

/** A fresh suggestion id and the token its emailed links carry. */
function mintIds(deps: SuggestionsDeps): { id: string; token: string } {
  const id = (deps.randomId ?? (() => `sug-${randomBytes(6).toString('hex')}`))();
  const token = (deps.randomToken ?? (() => randomBytes(24).toString('base64url')))();
  return { id, token };
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
        return res.status(200).send(alreadyPage(item.game, item.status));
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
          if (!(await decide(deps, item, wanted, now))) {
            return res.status(409).json({ error: `${item.game} was already ${await settledStatus(redis, item.id)}` });
          }
          const updated = parse(await redis.hgetall(itemKey(item.id)));
          return res.status(200).json({ item: updated ? publicView(updated) : null });
        }

        const item = await authorise(redis, body.id, body.token, res);
        if (!item) return res;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (!decidable(item.status)) {
          return res.status(200).send(alreadyPage(item.game, item.status));
        }
        if (!(await decide(deps, item, wanted, now))) {
          return res.status(200).send(alreadyPage(item.game, await settledStatus(redis, item.id)));
        }
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
        const name = checkName(body.name);
        if (name === null) return res.status(400).json({ error: NAME_ERROR });
        const note = cleanNote(body.note);
        if (note === null) return res.status(400).json({ error: NOTE_ERROR });
        if (body.type !== undefined && !isWishlistType(body.type)) {
          return res.status(400).json({ error: 'unknown wishlist type' });
        }
        const active = await loadList(redis, ACTIVE_KEY);
        const dup = active.find((s) => normalize(s.game) === normalize(g.game));
        if (dup) return res.status(409).json({ error: `${dup.game} is already on the list` });

        const { id, token } = mintIds(deps);
        const at = now();
        const item: Suggestion = { id, game: g.game, name, note, status: 'approved', createdAt: at, decidedAt: at, source: 'owner' };
        await redis.multi()
          .hset(itemKey(id), { id, game: g.game, name, note, status: 'approved', createdAt: at, decidedAt: at, source: 'owner', token })
          .lpush(ACTIVE_KEY, id)
          .lpush(APPROVED_KEY, id)
          .exec();
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
      const name = checkName(body.name);
      if (name === null) return res.status(400).json({ error: NAME_ERROR });
      const note = cleanNote(body.note);
      if (note === null) return res.status(400).json({ error: NOTE_ERROR });

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

      const { id, token } = mintIds(deps);
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
        // The owner can decide it from the site's queue while the send is
        // still trying; a decision stands, so only an undecided record
        // becomes unsent.
        if (parse(await redis.hgetall(itemKey(id)))?.decidedAt === undefined) {
          await redis.lrem(ACTIVE_KEY, 0, id);
          await redis.hset(itemKey(id), { status: 'unsent' });
          await redis.lpush(UNSENT_KEY, id);
        }
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
        // Unlike a new entry's, an edit's note must be text: null or a number
        // is a bad request, not a way to clear it.
        const note = typeof body.note === 'string' ? cleanNote(body.note) : null;
        if (note === null) return res.status(400).json({ error: NOTE_ERROR });
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
      await redis.multi()
        .lrem(APPROVED_KEY, 0, item.id)
        .lrem(ACTIVE_KEY, 0, item.id)
        .hset(itemKey(item.id), { status: 'removed', decidedAt: now() })
        .exec();
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return failWith500(res, 'suggestions api error:', err);
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
  const redis = getRawRedis();
  await handleSuggestions({
    redis,
    mailer: resendMailer(),
    baseUrl,
    lookup: (name) => lookupGame(name, process.env.BGG_API_TOKEN, fetch, 6000),
    admin: (r) => isAdmin(redis, r.headers ?? {}),
  }, req, res);
}
