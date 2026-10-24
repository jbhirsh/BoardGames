// Friends' game suggestions, approved by the owner by email or on the site
// (Query.suggestions, pendingSuggestions, previewGame, emailedSuggestion;
// Mutation.suggestGame, decideSuggestion, addGame, editSuggestion,
// removeSuggestion). The resolvers (index.ts) check the owner's session and
// JSON where an operation is the owner's, and call these.
//
// suggestGame validates a suggestion, stores it as `pending`, then emails
// the owner (Resend) approve and deny links carrying a per-suggestion token:
// stored first, so the emailed links always resolve. A send that fails (or
// passes its timeout) takes the record off the active list and marks it
// `unsent`, so the suggester can retry; its links keep working, since a
// timeout can follow a real delivery, it still shows in the owner's queue,
// and approving it returns it to the active list. With no Resend
// configuration it answers 503 rather than store a suggestion the owner
// would never see.
//
// The links open the app's /approve and /deny pages, which read the
// suggestion with its token (emailedSuggestion, openEmailed) and change
// nothing: mail link-scanners follow every URL. Both pages also look the
// game up (read-only, one lookup per read; previewEmailed) and show what
// BoardGameGeek has; the approve page also says why it has nothing, with a
// field to correct a misspelt name, which is only looked up again. Only the page's button
// decides, sending decideSuggestion with the token, the name and the
// previewed details (null for none, left out when BGG didn't answer).
// approvedList lists the approved suggestions, which the wishlist shows
// under "Suggested by friends".
//
// A signed-in owner can also work the list from the site: pendingList is
// the queue, decideSuggestion without a token decides one, previewGame looks
// a game up without storing anything ({ outcome, details? }, for the add
// form and the queue to show), addGame puts a game straight on the wishlist
// (approved, `source: 'owner'`; `details` are the previewed ones, null for
// none, absent to look it up here), editSuggestion changes how an entry
// reads, and removeSuggestion takes it off (status `removed`, the hash kept,
// the lists forgetting it).
//
// An approval, from either place, can carry what the owner saw before
// deciding: `game`, a corrected name (validated as an add's, refused with a
// 409 if another entry already lists it), and `details`, held to the same
// rules as an add's and stored with the status change, null to approve
// without any. Without `details` the game is looked up here, as before.
//
// Redis keeps one hash per suggestion and the id lists below, read through
// getRawRedis() so a game called "null" stays that. A decision first claims
// the record (decide), so a double-pressed button, or the email link and the
// site at once, decides it once; its writes go through one MULTI/EXEC, and a
// push removes the id first, so no list holds it twice. On approval (or an
// owner's add) the game is looked up on BoardGameGeek (_lib/bgg.ts) for
// players, time, the whole description, year, keywords and box art, stored
// as `details` so the entry renders and filters like any other; a miss, an
// outage or no token still approves, with details empty. With no
// BGG_API_TOKEN, BGG isn't called at all, and that or BGG refusing the token
// goes to Sentry as an error, so a missing token can't pass for "no match".
// The owner hears it too: the previews, the add and the approval answer with
// the lookup's outcome (found, no-match, no-token, refused, unavailable;
// `lookup` on the add and the approval, absent when none ran), which the
// pages put into words. Every function takes { redis, mailer, baseUrl,
// lookup } so tests pass spies, and refuses with an ApiError.

import * as Sentry from '@sentry/node';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { reportError } from '../_lib/sentry.js';
import { BGG_IMG_RE, DESC_MAX, MINS_MAX, PLAYERS_MAX, type LookupOutcome, type LookupResult } from '../_lib/bgg.js';
import { SLUG_RE, isSuggestionId } from '../_lib/slug.js';
import { button, escapeHtml, mailLayout, type Mail, type Mailer } from '../_lib/mail.js';
import { ApiError } from './errors.js';

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
type SuggestionStatus = 'pending' | 'approved' | 'denied' | 'unsent' | 'removed';

const decidable = (s: SuggestionStatus) => s === 'pending' || s === 'unsent';
// How long a decision's claim may stand without the decision landing.
const STALE_CLAIM_MS = 60_000;

// Lists the client also has (src/data/keywords.ts): the two trees can't
// import each other, so these are mirrored by hand and tests keep them in step.
/** Wishlist sections the owner can file a game under (WISHLIST_SECTIONS on the client). */
export const WISHLIST_SECTION_IDS = ['party', 'strategy', 'coop', 'two-player', 'heavy'] as const;
/** The keyword ids the client knows (KW on the client). */
export const KEYWORD_IDS = [
  'social',
  'bluffing',
  'deduction',
  'strategy',
  'negotiation',
  'abstract',
  'deck-building',
  'cooperative',
  'team',
  'party',
  'adult',
  'active',
  'creative',
  'card-game',
  'word',
  'family',
  'classic',
  'thematic',
  'portable',
  'quick-play',
] as const;
// Defined with the lookup, which caps BGG's numbers and text to them.
export { DESC_MAX, MINS_MAX, PLAYERS_MAX };
const KW_MAX = 20;

/** Details filled in from BoardGameGeek on approval, editable by the owner. */
interface SuggestionDetails {
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

interface SuggestionsPipeline {
  hgetall(key: string): SuggestionsPipeline;
  exec(): Promise<unknown[]>;
}

/** MULTI/EXEC: the queued writes land together or not at all. */
interface SuggestionsTransaction {
  hset(key: string, fields: Record<string, string | number>): SuggestionsTransaction;
  lpush(key: string, value: string): SuggestionsTransaction;
  lrem(key: string, count: number, value: string): SuggestionsTransaction;
  exec(): Promise<unknown[]>;
}

/**
 * The handler reads through a client that skips Upstash's JSON parsing (see
 * getRawRedis), so HGETALL answers a flat [field, value, ...] list of strings.
 */
interface SuggestionsRedis {
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

export interface SuggestionsDeps {
  redis: SuggestionsRedis;
  /** Fills in players, time, description and keywords on approval, or says why not; null skips enrichment. */
  lookup?: ((name: string) => Promise<LookupResult>) | null;
  /** null when email isn't configured: suggestions are then refused, never lost silently. */
  mailer: Mailer | null;
  /** Absolute origin the emailed links point at; only consulted when sending. */
  baseUrl: () => string;
  now?: () => number;
  randomId?: () => string;
  randomToken?: () => string;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

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
    status:
      status === 'approved' || status === 'denied' || status === 'unsent' || status === 'removed' ? status : 'pending',
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
  try {
    v = JSON.parse(raw);
  } catch {
    return undefined;
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
    kw: Array.isArray(d.kw) ? d.kw.filter((k: unknown): k is string => typeof k === 'string') : [],
    type: isWishlistType(d.type) ? d.type : undefined,
    img: typeof d.img === 'string' && /^https:\/\/\S+$/.test(d.img) ? d.img : undefined,
  };
}

/**
 * The owner's edits, validated field by field against the stored details.
 * Returns the merged details or the first problem.
 */
function mergeDetails(
  current: SuggestionDetails | undefined,
  raw: unknown,
): { ok: true; details: SuggestionDetails } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'details must be an object' };
  const d = raw as Record<string, unknown>;
  const base: SuggestionDetails = current ?? { min: 1, max: PLAYERS_MAX, mins: 0, desc: '', kw: [] };
  const int = (v: unknown, lo: number, hi: number, fallback: number): number | null =>
    v === undefined ? fallback : typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
  const min = int(d.min, 1, PLAYERS_MAX, base.min);
  const max = int(d.max, 1, PLAYERS_MAX, base.max);
  const mins = int(d.mins, 0, MINS_MAX, base.mins);
  if (min === null || max === null || min > max)
    return { ok: false, error: `players must be whole numbers from 1 to ${PLAYERS_MAX}, min at most max` };
  if (mins === null) return { ok: false, error: `minutes must be a whole number from 0 to ${MINS_MAX}` };
  let desc = base.desc;
  if (d.desc !== undefined) {
    // Normalise first: the edit form's textarea sends newlines, which are
    // whitespace to collapse, not control characters to refuse.
    const clean = typeof d.desc === 'string' ? d.desc.trim().replace(/\s+/g, ' ') : null;
    if (clean === null || clean.length > DESC_MAX || /[\p{C}]/u.test(clean))
      return { ok: false, error: `description must be at most ${DESC_MAX} characters` };
    desc = clean;
  }
  let kw = base.kw;
  if (d.kw !== undefined) {
    if (
      !Array.isArray(d.kw) ||
      d.kw.length > KW_MAX ||
      !d.kw.every((k: unknown) => (KEYWORD_IDS as readonly unknown[]).includes(k))
    )
      return { ok: false, error: 'keywords must be a short list of keyword ids' };
    kw = [...new Set(d.kw as string[])];
  }
  let type = base.type;
  if (d.type !== undefined) {
    if (d.type !== null && !isWishlistType(d.type)) return { ok: false, error: 'unknown wishlist type' };
    type = d.type === null ? undefined : d.type;
  }
  return { ok: true, details: { bggId: base.bggId, year: base.year, img: base.img, min, max, mins, desc, kw, type } };
}

const IMG_MAX = 500;

/**
 * Details the owner previewed on the add form, sent back with the add so the
 * game isn't looked up twice. Only the owner can send them, so where they
 * came from is trusted, but they are held to an edit's rules, and the fields
 * an edit can't set (BGG id, year, box art) to their own shapes. The section
 * comes from the add itself, so a `type` sent here is dropped unchecked.
 */
function previewedDetails(raw: unknown): { ok: true; details: SuggestionDetails } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'details must be an object' };
  const fields: Record<string, unknown> = { ...raw };
  delete fields.type;
  const merged = mergeDetails(undefined, fields);
  if (!merged.ok) return merged;
  const { bggId, year, img } = fields;
  if (bggId !== undefined && !(typeof bggId === 'number' && Number.isInteger(bggId) && bggId > 0)) {
    return { ok: false, error: 'bggId must be a positive whole number' };
  }
  if (year !== undefined && !(typeof year === 'number' && Number.isInteger(year) && Math.abs(year) <= 9999)) {
    return { ok: false, error: 'year must be a whole number' };
  }
  if (img !== undefined && !(typeof img === 'string' && img.length <= IMG_MAX && BGG_IMG_RE.test(img))) {
    return { ok: false, error: 'img must be a BoardGameGeek image URL' };
  }
  return { ok: true, details: { ...merged.details, type: undefined, bggId, year, img } };
}

/**
 * What the owner settled on before approving: a corrected name, and the
 * details previewed for it (null for none). Either absent keeps today's
 * approval: the friend's name, looked up here.
 */
interface ApprovalChoice {
  game?: string;
  details?: SuggestionDetails | null;
}

/**
 * Reads and checks an approval's `game` and `details` as an add's are,
 * then refuses a rename onto a game another entry already lists.
 */
async function approvalChoice(
  redis: SuggestionsRedis,
  item: Suggestion,
  input: ApprovalInput,
): Promise<ApprovalChoice> {
  const choice: ApprovalChoice = {};
  if (input.game !== undefined) {
    const g = validateGame(input.game);
    if (!g.ok) throw new ApiError(400, g.error);
    if (g.game !== item.game) choice.game = g.game;
  }
  if (input.details === null) choice.details = null;
  else if (input.details !== undefined) choice.details = checked(previewedDetails(input.details));
  if (choice.game !== undefined) {
    const dup = await listedAs(redis, choice.game, item.id);
    if (dup) throw new ApiError(409, `${dup.game} is already on the list`);
  }
  return choice;
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

/** The pending or approved entry, other than `exceptId`, already listing this game. */
async function listedAs(redis: SuggestionsRedis, game: string, exceptId?: string): Promise<Suggestion | undefined> {
  const active = await loadList(redis, ACTIVE_KEY);
  return active.find((s) => s.id !== exceptId && normalize(s.game) === normalize(game));
}

const publicView = ({
  id,
  game,
  name,
  note,
  status,
  createdAt,
  decidedAt,
  details,
  source,
}: Suggestion): Suggestion => ({ id, game, name, note, status, createdAt, decidedAt, details, source });

function approvalMail(s: Suggestion, approveUrl: string, denyUrl: string): Mail {
  const note = s.note ? `<p style="margin:0 0 16px;color:#6E6E73">“${escapeHtml(s.note)}”</p>` : '';
  return {
    subject: `Game suggestion: ${s.game} (from ${s.name})`,
    html: mailLayout(
      `<h2 style="margin:0 0 6px">${escapeHtml(s.game)}</h2>
<p style="margin:0 0 16px;color:#6E6E73">Suggested by <strong>${escapeHtml(s.name)}</strong></p>
${note}
<p style="margin:0 0 20px">Approve it to add it to the wishlist, or deny it to hide it. Either link asks you to confirm.</p>
${button(approveUrl, 'Approve', '#0071E3')}${button(denyUrl, 'Deny', '#6E6E73')}`,
      'Only someone with this email can use these links.',
    ),
  };
}

function tokenMatches(stored: string, given: string): boolean {
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** An item by id for an owner action: a malformed id is a 400, a missing one a 404. */
async function loadItem(redis: SuggestionsRedis, id: unknown): Promise<Suggestion & { token: string }> {
  if (typeof id !== 'string' || !SLUG_RE.test(id) || !isSuggestionId(id)) throw new ApiError(400, 'invalid id');
  const item = parse(await redis.hgetall(itemKey(id)));
  if (!item) throw new ApiError(404, 'suggestion not found');
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
    await reportError(
      'suggestions: BoardGameGeek lookup skipped',
      new Error('BGG_API_TOKEN is not set, so BoardGameGeek lookups are skipped and new wishlist games get no details'),
    );
  } else if (result.outcome === 'refused') {
    await reportError(
      'suggestions: BoardGameGeek lookup refused',
      new Error(`BoardGameGeek refused BGG_API_TOKEN (HTTP ${result.status}), so new wishlist games get no details`),
    );
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
async function enrich(
  deps: SuggestionsDeps,
  item: Suggestion,
  extra: Partial<SuggestionDetails> = {},
): Promise<LookupOutcome | undefined> {
  const result = await lookUp(deps, item.game);
  let details: SuggestionDetails | undefined;
  if (result?.outcome === 'found') {
    const found = result.details;
    details = {
      bggId: found.bggId,
      year: found.year,
      img: found.img,
      min: found.min,
      max: found.max,
      mins: found.mins,
      desc: found.desc,
      kw: found.kw,
    };
  }
  if (!details && extra.type) details = { min: 1, max: PLAYERS_MAX, mins: 0, desc: '', kw: [] };
  if (details) await deps.redis.hset(itemKey(item.id), { details: JSON.stringify({ ...details, ...extra }) });
  return result?.outcome;
}

/**
 * Flip a suggestion the caller has seen as decidable. Two requests can both
 * see it so (a double-clicked confirm form, or the email link and the site at
 * once), so the first claims it and the other gets null: only one flips the
 * status, touches the lists and runs the lookup, whose outcome it returns.
 * An approval's `choice` (a corrected name, previewed details) lands in the
 * same write as the status; with details chosen, nothing is looked up.
 */
async function decide(
  deps: SuggestionsDeps,
  item: Suggestion,
  wanted: 'approved' | 'denied',
  now: () => number,
  choice: ApprovalChoice = {},
): Promise<{ lookup?: LookupOutcome } | null> {
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
    if (!current?.decidedAt || !decidable(current.status) || at - current.decidedAt < STALE_CLAIM_MS) return null;
    // Two requests can find the same abandoned claim, so taking it over is a
    // claim of its own: HSETNX on a field named for that claim lets one win.
    if (!(await redis.hsetnx(key, `takeover:${current.decidedAt}`, at))) return null;
    await redis.hset(key, { decidedAt: at });
  }
  const tx = redis.multi().hset(key, {
    status: wanted,
    decidedAt: at,
    ...(choice.game !== undefined ? { game: choice.game } : {}),
    ...(choice.details ? { details: JSON.stringify(choice.details) } : {}),
  });
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
  if (wanted === 'denied' || choice.details !== undefined) return {};
  return { lookup: await enrich(deps, { ...item, game: choice.game ?? item.game }) };
}

/** What a request that lost the claim reports: the winner's status, once it has landed. */
async function settledStatus(redis: SuggestionsRedis, id: string): Promise<string> {
  const current = parse(await redis.hgetall(itemKey(id)));
  return current && !decidable(current.status) ? current.status : 'decided';
}

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

/** A validator's verdict, or its error as a 400. */
function checked<T>(result: { ok: true; details: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new ApiError(400, result.error);
  return result.details;
}

/** What a decision may bring besides its id: a corrected name and previewed details (null for none). */
export interface ApprovalInput {
  game?: unknown;
  details?: unknown;
}

const isLive = (s: Suggestion & { token: string }) => s.status === 'approved';

/** The approved suggestions, newest decision first, without their tokens. */
export async function approvedList(deps: SuggestionsDeps): Promise<Suggestion[]> {
  const approved = await loadList(deps.redis, APPROVED_KEY);
  return approved
    .filter(isLive)
    .sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0))
    .map(publicView);
}

/** The owner's queue: everything still waiting on a decision, including the ones whose email never went out. */
export async function pendingList(deps: SuggestionsDeps): Promise<Suggestion[]> {
  const { redis } = deps;
  const waiting = [...(await loadList(redis, ACTIVE_KEY)), ...(await loadList(redis, UNSENT_KEY))];
  const seen = new Set<string>();
  return waiting
    .filter((s) => decidable(s.status) && !seen.has(s.id) && seen.add(s.id))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(publicView);
}

/**
 * The suggestion behind an emailed link, once its token checks out: a bad
 * link is a 400, a missing record a 404, a wrong token a 403. Changes
 * nothing, whatever its status.
 */
export async function openEmailed(
  deps: SuggestionsDeps,
  id: unknown,
  token: unknown,
): Promise<Suggestion & { token: string }> {
  if (
    typeof id !== 'string' ||
    typeof token !== 'string' ||
    !SLUG_RE.test(id) ||
    !isSuggestionId(id) ||
    !TOKEN_RE.test(token)
  ) {
    throw new ApiError(400, 'This link is incomplete or mistyped. Open it again from the email.');
  }
  const item = parse(await deps.redis.hgetall(itemKey(id)));
  if (!item) throw new ApiError(404, 'There is no suggestion behind this link any more.');
  if (!tokenMatches(item.token, token)) {
    throw new ApiError(403, 'This link does not match the suggestion. Open it again from the email.');
  }
  return item;
}

/**
 * What the approve and deny pages show before the owner decides: the lookup for the
 * friend's name, or for `game` when the owner corrects it. Still a read
 * that changes nothing, the correction included; null once the suggestion
 * is decided, or with no lookup configured.
 */
export async function previewEmailed(
  deps: SuggestionsDeps,
  item: Suggestion,
  game: unknown,
): Promise<LookupResult | null> {
  if (!decidable(item.status)) return null;
  let name = item.game;
  if (game !== undefined && game !== null) {
    const g = validateGame(game);
    if (!g.ok) throw new ApiError(400, `Nothing was looked up: the ${g.error}.`, { code: 'BAD_NAME' });
    name = g.game;
  }
  return lookUp(deps, name);
}

/** A decided suggestion as it now stands, and how its lookup went when one ran. */
export interface Decided {
  item: Suggestion | null;
  lookup?: LookupOutcome;
}

/**
 * Approves or denies a waiting suggestion. With `token`, from an emailed
 * link (openEmailed's checks); without, as the owner, whose session the
 * resolver has checked. One already decided, or decided meanwhile by the
 * other place, is a 409 naming its status (`extensions.status`).
 */
export async function decideSuggestion(
  deps: SuggestionsDeps,
  input: ApprovalInput & { id: unknown; token?: unknown; decision: 'approve' | 'deny' },
): Promise<Decided> {
  const { redis } = deps;
  const now = deps.now ?? (() => Date.now());
  const item =
    input.token !== undefined ? await openEmailed(deps, input.id, input.token) : await loadItem(redis, input.id);
  const already = (status: string) =>
    new ApiError(409, `${item.game} was already ${status}`, { code: 'ALREADY_DECIDED', status });
  if (!decidable(item.status)) throw already(item.status);
  const wanted = input.decision === 'approve' ? 'approved' : 'denied';
  const choice = wanted === 'approved' ? await approvalChoice(redis, item, input) : {};
  const decided = await decide(deps, item, wanted, now, choice);
  if (!decided) throw already(await settledStatus(redis, item.id));
  const updated = parse(await redis.hgetall(itemKey(item.id)));
  return { item: updated ? publicView(updated) : null, ...decided };
}

/** Looks a game up without storing anything, for the add form and the queue to show. */
export async function previewGame(deps: SuggestionsDeps, game: unknown): Promise<LookupResult> {
  const g = validateGame(game);
  if (!g.ok) throw new ApiError(400, g.error);
  const result = await lookUp(deps, g.game);
  return result ?? { outcome: 'unavailable' };
}

export interface AddInput {
  game: unknown;
  name: unknown;
  note?: unknown;
  type?: unknown;
  details?: unknown;
}

/**
 * The owner adding a game straight to the wishlist: stored approved, no
 * email. Details previewed on the form come with it (null when the owner
 * adds it without any); without them it is looked up the same way an
 * approved suggestion is.
 */
export async function addGame(deps: SuggestionsDeps, input: AddInput): Promise<Decided> {
  const { redis } = deps;
  const now = deps.now ?? (() => Date.now());
  const g = validateGame(input.game);
  if (!g.ok) throw new ApiError(400, g.error);
  const name = checkName(input.name);
  if (name === null) throw new ApiError(400, NAME_ERROR);
  const note = cleanNote(input.note);
  if (note === null) throw new ApiError(400, NOTE_ERROR);
  if (input.type !== undefined && input.type !== null && !isWishlistType(input.type)) {
    throw new ApiError(400, 'unknown wishlist type');
  }
  const extra: Partial<SuggestionDetails> = isWishlistType(input.type) ? { type: input.type } : {};
  const previewed = input.details !== undefined;
  let details: SuggestionDetails | undefined;
  if (previewed && input.details !== null) details = checked(previewedDetails(input.details));
  else if (previewed && extra.type) details = { min: 1, max: PLAYERS_MAX, mins: 0, desc: '', kw: [] };
  const dup = await listedAs(redis, g.game);
  if (dup) throw new ApiError(409, `${dup.game} is already on the list`);

  const { id, token } = mintIds(deps);
  const at = now();
  const item: Suggestion = {
    id,
    game: g.game,
    name,
    note,
    status: 'approved',
    createdAt: at,
    decidedAt: at,
    source: 'owner',
  };
  await redis
    .multi()
    .hset(itemKey(id), {
      id,
      game: g.game,
      name,
      note,
      status: 'approved',
      createdAt: at,
      decidedAt: at,
      source: 'owner',
      token,
      ...(details ? { details: JSON.stringify({ ...details, ...extra }) } : {}),
    })
    .lpush(ACTIVE_KEY, id)
    .lpush(APPROVED_KEY, id)
    .exec();
  const lookup = previewed ? undefined : await enrich(deps, item, extra);
  const stored = parse(await redis.hgetall(itemKey(id)));
  return { item: stored ? publicView(stored) : publicView(item), lookup };
}

export interface SuggestInput {
  game: unknown;
  name: unknown;
  note?: unknown;
}

/** A new suggestion from the form, stored and then emailed to the owner. */
export async function suggestGame(deps: SuggestionsDeps, input: SuggestInput): Promise<Suggestion> {
  const { redis, mailer } = deps;
  const now = deps.now ?? (() => Date.now());
  if (!mailer) throw new ApiError(503, 'Suggestions are not open yet');
  const g = validateGame(input.game);
  if (!g.ok) throw new ApiError(400, g.error);
  const game = g.game;
  const name = checkName(input.name);
  if (name === null) throw new ApiError(400, NAME_ERROR);
  const note = cleanNote(input.note);
  if (note === null) throw new ApiError(400, NOTE_ERROR);

  // Read-then-write: two different people suggesting the same game in the
  // same instant can both get through. Accepted; the owner just sees two
  // emails and approves one. A lock isn't worth it at this traffic.
  const active = await loadList(redis, ACTIVE_KEY);
  const dup = active.find((s) => s.status !== 'denied' && normalize(s.game) === normalize(game));
  if (dup) {
    throw new ApiError(
      409,
      dup.status === 'approved'
        ? `${dup.game} is already on the wishlist`
        : `${dup.game} has already been suggested and is waiting for approval`,
    );
  }

  const { id, token } = mintIds(deps);
  const item: Suggestion = { id, game, name, note, status: 'pending', createdAt: now(), source: 'friend' };
  const link = (page: string) =>
    `${deps.baseUrl()}/${page}?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;

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
  return publicView(item);
}

export interface EditInput {
  id: unknown;
  game?: unknown;
  note?: unknown;
  details?: unknown;
}

/** The owner editing how an approved (or waiting) game reads on the wishlist. */
export async function editSuggestion(deps: SuggestionsDeps, input: EditInput): Promise<Suggestion | null> {
  const { redis } = deps;
  const item = await loadItem(redis, input.id);
  if (item.status === 'removed' || item.status === 'denied') {
    throw new ApiError(409, `${item.game} is not on the wishlist`);
  }
  const fields: Record<string, string | number> = {};
  if (input.game !== undefined) {
    const g = validateGame(input.game);
    if (!g.ok) throw new ApiError(400, g.error);
    fields.game = g.game;
  }
  if (input.note !== undefined) {
    // Unlike a new entry's, an edit's note must be text: null is a bad
    // request, not a way to clear it.
    const note = typeof input.note === 'string' ? cleanNote(input.note) : null;
    if (note === null) throw new ApiError(400, NOTE_ERROR);
    fields.note = note;
  }
  if (input.details !== undefined) fields.details = JSON.stringify(checked(mergeDetails(item.details, input.details)));
  if (Object.keys(fields).length === 0) throw new ApiError(400, 'nothing to change');
  await redis.hset(itemKey(item.id), fields);
  const updated = parse(await redis.hgetall(itemKey(item.id)));
  return updated ? publicView(updated) : null;
}

/**
 * The owner taking a game off the wishlist. The hash stays so old links and
 * ids still resolve; only the lists forget it.
 */
export async function removeSuggestion(deps: SuggestionsDeps, id: unknown): Promise<void> {
  const { redis } = deps;
  const now = deps.now ?? (() => Date.now());
  const item = await loadItem(redis, id);
  // Only what is on the wishlist can come off it; a pending suggestion is
  // denied through decide(), which keeps the queue's bookkeeping.
  if (item.status !== 'approved') throw new ApiError(409, `${item.game} is not on the wishlist`);
  await redis
    .multi()
    .lrem(APPROVED_KEY, 0, item.id)
    .lrem(ACTIVE_KEY, 0, item.id)
    .hset(itemKey(item.id), { status: 'removed', decidedAt: now() })
    .exec();
}
