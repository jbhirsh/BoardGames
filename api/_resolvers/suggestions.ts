// Friends' game suggestions and the owner's wishlist, in the API's database
// (#290's part 2b): Query.pendingSuggestions, previewGame, emailedSuggestion;
// Mutation.suggestGame, decideSuggestion, addGame, editGame, removeGame. The
// resolvers (index.ts) check the owner's session and JSON where an
// operation is the owner's, and call these.
//
// suggestGame validates a suggestion, spells it as BoardGameGeek does when
// the two differ only in case, spacing or punctuation (one quick search,
// which a slow or failed BGG never holds up), stores it as `pending`, then
// emails the owner links to the approve and deny pages. A send that fails
// (or passes its timeout) marks it `unsent`, so the suggester can retry; it
// still shows in the owner's queue, and the owner can decide it there. With
// no Resend configuration it answers 503 rather than store a suggestion the
// owner would never see.
//
// The emailed links carry only the suggestion's id. Their pages read it
// (emailedSuggestion) and change nothing, as mail link-scanners follow
// every URL, and only for a signed-in owner: the owner's session is the one
// thing that decides a suggestion, from the page's button or the site's
// queue alike. Both look the game up (read-only; previewEmailed, previewGame)
// and show what BoardGameGeek has.
//
// A decision is one conditional UPDATE … WHERE status IN ('pending',
// 'unsent') … RETURNING, in a transaction with what an approval writes, so
// a double-pressed button, or the email's page and the site at once,
// decides it once and the other answers 409 with what it became. An
// approval (or an owner's add) puts a `games` row on the wishlist, filed
// under the section BoardGameGeek's players, weight, categories and
// mechanics give it (section.ts), and keeps what BGG says about it in
// `bgg_info`. The lookup runs first, outside the transaction: a miss, an
// outage or no token still approves, with the details empty. With no
// BGG_API_TOKEN, BGG isn't called at all, and that or BGG refusing the token
// goes to Sentry as an error, so a missing token can't pass for "no match".
// The owner hears it too: the previews, the add and the approval answer
// with the lookup's outcome, which the pages put into words.
//
// Every game on the wishlist can be edited (editGame) and taken off it
// (removeGame, status `removed`, the row kept so old ids still resolve),
// whether it was written into the site, suggested or added. Duplicates are
// checked against every game not removed, by name with case, spacing and
// punctuation ignored. Every function takes { db, mailer, baseUrl, lookup,
// spelling, item } so tests pass fakes, and refuses with an ApiError.

import * as Sentry from '@sentry/node';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { reportError } from '../_lib/sentry.js';
import { BGG_IMG_RE, type BggItem, type GameDetails, type LookupOutcome, type LookupResult } from '../_lib/bgg.js';
import {
  DESC_MAX,
  GAME_MAX,
  GAME_MIN,
  KEYWORD_IDS,
  MINS_MAX,
  NAME_RE,
  NOTE_MAX,
  PLAYERS_MAX,
  WISHLIST_SECTION_IDS,
  type WishlistSection,
} from '../_lib/limits.js';
import { SLUG_RE, isSuggestionId } from '../_lib/slug.js';
import { button, escapeHtml, mailLayout, type Mail, type Mailer } from '../_lib/mail.js';
import { bggInfo, games, suggestions } from '../_db/schema.js';
import { bggInfoRow, checked as row, gameRow, suggestionRow } from '../_db/validation.js';
import { ApiError } from './errors.js';

const KW_MAX = 20;

type SuggestionStatus = (typeof suggestions.$inferSelect)['status'];
const DECIDABLE = ['pending', 'unsent'] as const;
const decidable = (s: SuggestionStatus) => s === 'pending' || s === 'unsent';

/** A suggestion as the API answers it. */
export interface Suggestion {
  id: string;
  game: string;
  name: string;
  note: string;
  status: SuggestionStatus;
  createdAt: number;
  decidedAt?: number;
  /** Who put it on the list: a friend's suggestion, or the owner directly. */
  source: 'friend' | 'owner';
}

type GameRowType = typeof games.$inferSelect;

/** A wishlist game as the API answers it: its row, with the note of the suggestion it came from. */
export type WishlistGame = GameRowType & { note: string };

export interface SuggestionsDeps {
  db: () => Promise<LibSQLDatabase>;
  /** Fills in a game's details on approval, or says why not; null skips it. */
  lookup?: ((name: string) => Promise<LookupResult>) | null;
  /** BGG's spelling of a typed name, or null for none or any failure (bggSpelling, which never throws); null skips it. */
  spelling?: ((name: string) => Promise<string | null>) | null;
  /**
   * BGG's summary and honours by id, for an add with previewed details, or
   * null for any failure (fetchBggItem, which never throws); null skips it.
   */
  item?: ((bggId: number) => Promise<BggItem | null>) | null;
  /** null when email isn't configured: suggestions are then refused, never lost silently. */
  mailer: Mailer | null;
  /** Absolute origin the emailed links point at; only consulted when sending. */
  baseUrl: () => string;
  now?: () => number;
  randomId?: () => string;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const view = (s: typeof suggestions.$inferSelect): Suggestion => ({
  id: s.id,
  game: s.gameName,
  name: s.name,
  note: s.note,
  status: s.status,
  createdAt: s.createdAt,
  ...(s.decidedAt == null ? {} : { decidedAt: s.decidedAt }),
  source: s.source,
});

/** Details a game is saved with: BGG's, previewed or looked up, or the owner's edits. */
interface Details {
  bggId?: number;
  year?: number;
  min: number;
  max: number;
  mins: number;
  desc: string;
  kw: string[];
  img?: string;
  section?: WishlistSection;
  /** BGG's weight, which a preview brings back to keep in bgg_info. */
  weight?: number;
}

const isSection = (v: unknown): v is WishlistSection =>
  typeof v === 'string' && (WISHLIST_SECTION_IDS as readonly string[]).includes(v);

/** A validator's verdict, or its error as a 400. */
function ok<T>(result: { ok: true; details: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new ApiError(400, result.error);
  return result.details;
}

/** The owner's edits, validated field by field against what's stored. */
function mergeDetails(base: Details, raw: unknown): { ok: true; details: Details } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'details must be an object' };
  const d = raw as Record<string, unknown>;
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
  let section = base.section;
  if (d.type !== undefined) {
    if (d.type !== null && !isSection(d.type)) return { ok: false, error: 'unknown wishlist type' };
    section = d.type === null ? undefined : d.type;
  }
  return { ok: true, details: { ...base, min, max, mins, desc, kw, section } };
}

const IMG_MAX = 500;
const EMPTY: Details = { min: 1, max: PLAYERS_MAX, mins: 0, desc: '', kw: [] };

/**
 * Details the owner previewed, sent back with an add or an approval so the
 * game isn't looked up twice. Only the owner can send them, so where they
 * came from is trusted, but they're held to an edit's rules, and the fields
 * an edit can't set (BGG id, year, box art, the inferred section) to their
 * own shapes.
 */
function previewedDetails(raw: unknown): { ok: true; details: Details } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'details must be an object' };
  const fields: Record<string, unknown> = { ...raw };
  const { bggId, year, img, section, weight } = fields;
  delete fields.section;
  delete fields.weight;
  const merged = mergeDetails(EMPTY, fields);
  if (!merged.ok) return merged;
  if (bggId != null && !(typeof bggId === 'number' && Number.isInteger(bggId) && bggId > 0)) {
    return { ok: false, error: 'bggId must be a positive whole number' };
  }
  if (year != null && !(typeof year === 'number' && Number.isInteger(year) && Math.abs(year) <= 9999)) {
    return { ok: false, error: 'year must be a whole number' };
  }
  if (img != null && !(typeof img === 'string' && img.length <= IMG_MAX && BGG_IMG_RE.test(img))) {
    return { ok: false, error: 'img must be a BoardGameGeek image URL' };
  }
  if (section != null && !isSection(section)) return { ok: false, error: 'unknown wishlist type' };
  if (weight != null && !(typeof weight === 'number' && weight >= 1 && weight <= 5)) {
    return { ok: false, error: 'weight must be from 1 to 5' };
  }
  return {
    ok: true,
    details: {
      ...merged.details,
      ...(bggId == null ? {} : { bggId }),
      ...(year == null ? {} : { year }),
      ...(img == null ? {} : { img }),
      ...(section == null ? {} : { section }),
      ...(weight == null ? {} : { weight }),
    },
  };
}

const fromLookup = (d: GameDetails): Details => ({
  bggId: d.bggId,
  ...(d.year === undefined ? {} : { year: d.year }),
  min: d.min,
  max: d.max,
  mins: d.mins,
  desc: d.desc,
  kw: d.kw,
  ...(d.img === undefined ? {} : { img: d.img }),
  section: d.section,
});

/** What a card shows for players: "2–4", "3+" for 99, none when unknown. */
function playersLabel(min: number, max: number): string {
  if (max >= PLAYERS_MAX) return `${min}+`;
  return min === max ? String(min) : `${min}–${max}`;
}

/** A game's row from its details, for a game added on the site. */
function gameFrom(
  id: string,
  name: string,
  source: 'friend' | 'owner',
  suggestedBy: string | null,
  details: Details | null,
  at: number,
): typeof games.$inferInsert {
  const d = details ?? EMPTY;
  const known = !!details;
  return row(
    gameRow,
    {
      id,
      name,
      status: 'wanted',
      source,
      suggestedBy,
      players: known ? playersLabel(d.min, d.max) : null,
      minPlayers: d.min,
      maxPlayers: d.max,
      dur: known && d.mins > 0 ? `${d.mins} min` : null,
      minutes: d.mins,
      description: d.desc,
      keywords: d.kw,
      section: d.section ?? null,
      image: d.img ?? null,
      bggId: d.bggId ?? null,
      year: d.year ?? null,
      createdAt: at,
    },
    `${name}'s row`,
  );
}

/** `bgg_info` for a game BGG found, written (or refreshed) with its row. */
function infoFrom(
  bggId: number,
  name: string,
  weight: number | undefined,
  item: BggItem | null | undefined,
  at: number,
): typeof bggInfo.$inferInsert {
  // BGG's extras never block saving the game: what's past the table's
  // bounds is cut to them, not refused.
  const honours = (item?.honours ?? [])
    .filter((h) => h.name.trim() && h.result.trim())
    .slice(0, 200)
    .map((h) => ({ name: h.name.slice(0, 200), year: h.year, result: h.result.slice(0, 40) }));
  return row(
    bggInfoRow,
    {
      bggId,
      name: name.slice(0, 200),
      summary: item?.summary?.slice(0, 300) ?? null,
      honours,
      weight: weight ?? null,
      // A row BGG's site didn't answer for stays oldest, so the next
      // build's refresh fills it first.
      fetchedAt: item ? at : 0,
    },
    `${name}'s BoardGameGeek data`,
  );
}

function approvalMail(s: Suggestion, approveUrl: string, denyUrl: string): Mail {
  const note = s.note ? `<p style="margin:0 0 16px;color:#6E6E73">“${escapeHtml(s.note)}”</p>` : '';
  return {
    subject: `Game suggestion: ${s.game} (from ${s.name})`,
    html: mailLayout(
      `<h2 style="margin:0 0 6px">${escapeHtml(s.game)}</h2>
<p style="margin:0 0 16px;color:#6E6E73">Suggested by <strong>${escapeHtml(s.name)}</strong></p>
${note}
<p style="margin:0 0 20px">Sign in on the site to decide; these links open the page, which asks you to confirm.</p>
${button(approveUrl, 'Approve', '#0071E3')}${button(denyUrl, 'Deny', '#6E6E73')}`,
      'Only the owner, signed in, can decide a suggestion.',
    ),
  };
}

/** A suggestion by id: a malformed id is a 400, a missing one a 404. */
async function loadSuggestion(db: LibSQLDatabase, id: unknown, missing = 'suggestion not found') {
  if (typeof id !== 'string' || !SLUG_RE.test(id) || !isSuggestionId(id)) throw new ApiError(400, 'invalid id');
  const [found] = await db.select().from(suggestions).where(eq(suggestions.id, id));
  if (!found) throw new ApiError(404, missing);
  return found;
}

/** A wishlist game by id, for an owner's edit or removal. */
async function loadGame(db: LibSQLDatabase, id: unknown): Promise<GameRowType> {
  if (typeof id !== 'string' || !SLUG_RE.test(id)) throw new ApiError(400, 'invalid id');
  const [found] = await db.select().from(games).where(eq(games.id, id));
  if (!found) throw new ApiError(404, 'game not found');
  if (found.status !== 'wanted') throw new ApiError(409, `${found.name} is not on the wishlist`);
  return found;
}

/** The game, other than `exceptId`, already listing this name: any not taken off the list. */
async function listedAs(db: LibSQLDatabase, game: string, exceptId?: string): Promise<GameRowType | undefined> {
  const listed = await db.select().from(games).where(ne(games.status, 'removed'));
  return listed.find((g) => g.id !== exceptId && normalize(g.name) === normalize(game));
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

/** BGG's summary and honours for previewed details, best effort: an outage leaves them for the refresh. */
async function itemFor(deps: SuggestionsDeps, bggId: number | undefined): Promise<BggItem | null> {
  if (bggId === undefined || !deps.item) return null;
  return deps.item(bggId);
}

/**
 * What a new game is saved with: the previewed details (`given`, null for
 * none), or, with none given, what a lookup of `game` finds now, with how
 * it went. Previewed details bring their own section and weight; their
 * summary and honours are asked of BGG's site by id.
 */
async function detailsFor(
  deps: SuggestionsDeps,
  game: string,
  given: Details | null | undefined,
): Promise<{
  details: Details | null;
  weight?: number;
  bggName?: string;
  item?: BggItem | null;
  lookup?: LookupOutcome;
}> {
  if (given !== undefined) {
    const item = await itemFor(deps, given?.bggId);
    return { details: given, weight: given?.weight, bggName: item?.name, item };
  }
  const result = await lookUp(deps, game);
  if (result?.outcome !== 'found') return { details: null, lookup: result?.outcome };
  const d = result.details;
  const item = d.honours ? { ...(d.summary ? { summary: d.summary } : {}), honours: d.honours } : null;
  return { details: fromLookup(d), weight: d.weight, bggName: d.name, item, lookup: 'found' };
}

/** The statements that keep BGG's data for a new game: an insert, or a refresh of the row already there. */
function saveInfo(
  db: Pick<LibSQLDatabase, 'insert'>,
  name: string,
  saved: Awaited<ReturnType<typeof detailsFor>>,
  at: number,
) {
  const bggId = saved.details?.bggId;
  if (bggId === undefined) return null;
  const info = infoFrom(bggId, saved.bggName ?? name, saved.weight, saved.item, at);
  // Only BGG's own name replaces a stored one: the typed name stands in
  // for a new row, never over the spelling BGG already gave this id.
  const update: Partial<typeof bggInfo.$inferInsert> = saved.bggName ? { name: saved.bggName } : {};
  if (saved.item) Object.assign(update, { summary: info.summary, honours: info.honours, fetchedAt: info.fetchedAt });
  if (info.weight != null) update.weight = info.weight;
  const insert = db.insert(bggInfo).values(info);
  return Object.keys(update).length === 0
    ? insert.onConflictDoNothing({ target: bggInfo.bggId })
    : insert.onConflictDoUpdate({ target: bggInfo.bggId, set: update });
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

const mintId = (deps: SuggestionsDeps) => (deps.randomId ?? (() => `sug-${randomBytes(6).toString('hex')}`))();

function validateGame(v: unknown): { ok: true; game: string } | { ok: false; error: string } {
  const game = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (game.length < GAME_MIN || game.length > GAME_MAX || /[\p{C}]/u.test(game)) {
    return { ok: false, error: `game must be ${GAME_MIN}–${GAME_MAX} characters` };
  }
  return { ok: true, game };
}

/**
 * A suggestion's or an add's game, name and note, cleaned, in that order of
 * checking; a 400 naming the first that fails.
 */
function entryOf(input: { game: unknown; name: unknown; note?: unknown }): {
  game: string;
  name: string;
  note: string;
} {
  const g = validateGame(input.game);
  if (!g.ok) throw new ApiError(400, g.error);
  const name = checkName(input.name);
  if (name === null) throw new ApiError(400, NAME_ERROR);
  const note = cleanNote(input.note);
  if (note === null) throw new ApiError(400, NOTE_ERROR);
  return { game: g.game, name, note };
}

/** What a decision may bring besides its id: a corrected name and previewed details (null for none). */
export interface ApprovalInput {
  game?: unknown;
  details?: unknown;
}

/** The owner's queue: everything still waiting on a decision, the ones whose email never went out included. */
export async function pendingList(deps: SuggestionsDeps): Promise<Suggestion[]> {
  const db = await deps.db();
  const waiting = await db
    .select()
    .from(suggestions)
    .where(inArray(suggestions.status, [...DECIDABLE]))
    .orderBy(desc(suggestions.createdAt));
  return waiting.map(view);
}

/**
 * Every game on the wishlist: the written ones first, then those added on
 * the site, newest first, as the friends' suggestions always were; each
 * with the note of the suggestion it came from.
 */
export async function wishlist(deps: Pick<SuggestionsDeps, 'db'>): Promise<WishlistGame[]> {
  const db = await deps.db();
  const wanted = await db.select().from(games).where(eq(games.status, 'wanted'));
  const notes = await db
    .select({ gameId: suggestions.gameId, note: suggestions.note })
    .from(suggestions)
    .where(eq(suggestions.status, 'approved'));
  const noteOf = new Map(notes.map((n) => [n.gameId, n.note]));
  return wanted
    .sort((a, b) => (b.createdAt ?? Infinity) - (a.createdAt ?? Infinity) || a.name.localeCompare(b.name))
    .map((g) => ({ ...g, note: noteOf.get(g.id) ?? '' }));
}

/** The suggestion behind an emailed link, for the owner (the resolver checks): a bad id is a 400, a missing one a 404. */
export async function openEmailed(deps: SuggestionsDeps, id: unknown): Promise<Suggestion> {
  if (typeof id !== 'string' || !SLUG_RE.test(id) || !isSuggestionId(id)) {
    throw new ApiError(400, 'This link is incomplete or mistyped. Open it again from the email.');
  }
  return view(await loadSuggestion(await deps.db(), id, 'There is no suggestion behind this link any more.'));
}

/**
 * What the approve and deny pages show before the owner decides: the lookup
 * for the friend's name, or for `game` when the owner corrects it. Still a
 * read that changes nothing, the correction included; null once the
 * suggestion is decided, or with no lookup configured.
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
 * Approves or denies a waiting suggestion, as the owner (the resolver has
 * checked the session). One already decided, or decided meanwhile from the
 * other place, is a 409 naming its status (`extensions.status`). An
 * approval may rename the game (refused with a 409 onto one already listed)
 * and bring the details the owner saw; without them it's looked up here.
 */
export async function decideSuggestion(
  deps: SuggestionsDeps,
  input: ApprovalInput & { id: unknown; decision: 'approve' | 'deny' },
): Promise<Decided> {
  const db = await deps.db();
  const now = deps.now ?? (() => Date.now());
  const item = await loadSuggestion(db, input.id);
  const already = (status: string) =>
    new ApiError(409, `${item.gameName} was already ${status}`, { code: 'ALREADY_DECIDED', status });
  if (!decidable(item.status)) throw already(item.status);

  let game = item.gameName;
  let saved: Awaited<ReturnType<typeof detailsFor>> | null = null;
  if (input.decision === 'approve') {
    if (input.game !== undefined) {
      const g = validateGame(input.game);
      if (!g.ok) throw new ApiError(400, g.error);
      game = g.game;
    }
    const dup = await listedAs(db, game, item.id);
    if (dup) throw new ApiError(409, `${dup.name} is already on the list`);
    const given =
      input.details === undefined ? undefined : input.details === null ? null : ok(previewedDetails(input.details));
    saved = await detailsFor(deps, game, given);
  }

  const at = now();
  const status = input.decision === 'approve' ? 'approved' : 'denied';
  const decided = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(suggestions)
      .set({ status, decidedAt: at })
      .where(and(eq(suggestions.id, item.id), inArray(suggestions.status, [...DECIDABLE])))
      .returning();
    if (!updated) return null;
    if (!saved) return updated;
    // The game's row takes the suggestion's id, so the votes and links
    // that name it keep working.
    await tx
      .insert(games)
      .values(gameFrom(item.id, game, item.source, item.source === 'friend' ? item.name : null, saved.details, at));
    const info = saveInfo(tx, game, saved, at);
    if (info) await info;
    const [linked] = await tx
      .update(suggestions)
      .set({ gameId: item.id })
      .where(eq(suggestions.id, item.id))
      .returning();
    return linked;
  });
  if (!decided) {
    const [current] = await db
      .select({ status: suggestions.status })
      .from(suggestions)
      .where(eq(suggestions.id, item.id));
    throw already(current && !decidable(current.status) ? current.status : 'decided');
  }
  return { item: view(decided), ...(saved?.lookup ? { lookup: saved.lookup } : {}) };
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
  details?: unknown;
}

/**
 * The owner adding a game straight to the wishlist: stored approved, no
 * email. Details previewed on the form come with it (null when the owner
 * adds it without any); without them it is looked up as an approval is.
 */
export async function addGame(deps: SuggestionsDeps, input: AddInput): Promise<Decided> {
  const db = await deps.db();
  const now = deps.now ?? (() => Date.now());
  const { game, name, note } = entryOf(input);
  const given =
    input.details === undefined ? undefined : input.details === null ? null : ok(previewedDetails(input.details));
  const dup = await listedAs(db, game);
  if (dup) throw new ApiError(409, `${dup.name} is already on the list`);
  const saved = await detailsFor(deps, game, given);

  const id = mintId(deps);
  const at = now();
  const suggestion = row(
    suggestionRow,
    { id, gameName: game, name, note, status: 'approved', source: 'owner', gameId: id, createdAt: at, decidedAt: at },
    `${game}'s suggestion`,
  );
  await db.transaction(async (tx) => {
    await tx.insert(games).values(gameFrom(id, game, 'owner', null, saved.details, at));
    await tx.insert(suggestions).values(suggestion);
    const info = saveInfo(tx, game, saved, at);
    if (info) await info;
  });
  const [stored] = await db.select().from(suggestions).where(eq(suggestions.id, id));
  return { item: view(stored), ...(saved.lookup ? { lookup: saved.lookup } : {}) };
}

export interface SuggestInput {
  game: unknown;
  name: unknown;
  note?: unknown;
}

/** BGG's spelling of `game` when it's only a matter of case, spacing or punctuation; otherwise `game`. */
async function spelt(deps: SuggestionsDeps, game: string): Promise<string> {
  if (!deps.spelling) return game;
  const bgg = await deps.spelling(game);
  return bgg && normalize(bgg) === normalize(game) && validateGame(bgg).ok ? bgg : game;
}

/** A new suggestion from the form, stored and then emailed to the owner. */
export async function suggestGame(deps: SuggestionsDeps, input: SuggestInput): Promise<Suggestion> {
  const { mailer } = deps;
  const now = deps.now ?? (() => Date.now());
  if (!mailer) throw new ApiError(503, 'Suggestions are not open yet');
  const { game: typed, name, note } = entryOf(input);
  const db = await deps.db();

  // Read-then-write: two different people suggesting the same game in the
  // same instant can both get through. Accepted; the owner just sees two
  // emails and approves one. A lock isn't worth it at this traffic.
  const dup = await listedAs(db, typed);
  if (dup) throw new ApiError(409, `${dup.name} is already on the wishlist`);
  const waiting = await db
    .select()
    .from(suggestions)
    .where(inArray(suggestions.status, [...DECIDABLE]));
  const sameGame = waiting.filter((s) => normalize(s.gameName) === normalize(typed));
  const pending = sameGame.find((s) => s.status === 'pending');
  if (pending) {
    throw new ApiError(409, `${pending.gameName} has already been suggested and is waiting for approval`);
  }
  // Only the same person's unsent suggestion is theirs to send again; one
  // someone else made whose email failed stays theirs, beside this one.
  const queued = sameGame.find((s) => s.status === 'unsent' && s.name.toLowerCase() === name.toLowerCase());

  const game = await spelt(deps, typed);
  const createdAt = now();
  const fresh = (id: string) =>
    row(
      suggestionRow,
      { id, gameName: game, name, note, status: 'pending', source: 'friend', createdAt },
      `${game}'s suggestion`,
    );

  // Store first, then email, so the links in the owner's inbox always
  // resolve. If delivery fails, mark it unsent so the suggester can retry
  // instead of hitting the duplicate check for a request the owner never
  // received; it stays in the owner's queue all the same. The same
  // person's one whose email never went out is the same suggestion, sent
  // again: it keeps its id, so the owner's queue holds it once. Taking it back and storing it again is
  // one transaction, so a decision can't land between them; one the owner
  // decided before it (the delete finds no unsent row) stands, and this is
  // a new suggestion under a new id.
  const id = await db.transaction(async (tx) => {
    const taken = queued
      ? await tx
          .delete(suggestions)
          .where(and(eq(suggestions.id, queued.id), eq(suggestions.status, 'unsent')))
          .returning({ id: suggestions.id })
      : [];
    const kept = taken[0]?.id ?? mintId(deps);
    await tx.insert(suggestions).values(fresh(kept));
    return kept;
  });
  const item: Suggestion = { id, game, name, note, status: 'pending', createdAt, source: 'friend' };
  const link = (page: string) => `${deps.baseUrl()}/${page}?id=${encodeURIComponent(id)}`;

  try {
    await mailer.send(approvalMail(item, link('approve'), link('deny')));
  } catch (err) {
    // The owner can decide it from the site's queue while the send is
    // still trying; a decision stands, so only a pending record becomes
    // unsent.
    await db
      .update(suggestions)
      .set({ status: 'unsent' })
      .where(and(eq(suggestions.id, id), eq(suggestions.status, 'pending')));
    throw err;
  }
  return item;
}

export interface EditInput {
  id: unknown;
  game?: unknown;
  /** The note of the suggestion the game came from; a written entry has none. */
  note?: unknown;
  details?: unknown;
}

/** The owner editing how a wishlist game reads, whichever way it got there, and the note it came with. */
export async function editGame(deps: SuggestionsDeps, input: EditInput): Promise<WishlistGame> {
  const db = await deps.db();
  const game = await loadGame(db, input.id);
  const fields: Partial<typeof games.$inferInsert> = {};
  if (input.game !== undefined) {
    const g = validateGame(input.game);
    if (!g.ok) throw new ApiError(400, g.error);
    const dup = await listedAs(db, g.game, game.id);
    if (dup) throw new ApiError(409, `${dup.name} is already on the list`);
    fields.name = g.game;
  }
  if (input.details !== undefined) {
    const base: Details = {
      min: game.minPlayers,
      max: game.maxPlayers,
      mins: game.minutes,
      desc: game.description,
      kw: game.keywords,
      ...(isSection(game.section) ? { section: game.section } : {}),
    };
    const d = ok(mergeDetails(base, input.details));
    Object.assign(fields, {
      minPlayers: d.min,
      maxPlayers: d.max,
      minutes: d.mins,
      description: d.desc,
      keywords: d.kw,
      section: d.section ?? null,
    });
    if (d.min !== game.minPlayers || d.max !== game.maxPlayers) fields.players = playersLabel(d.min, d.max);
    if (d.mins !== game.minutes) fields.dur = d.mins > 0 ? `${d.mins} min` : null;
  }
  let note: string | undefined;
  if (input.note !== undefined) {
    // Unlike a new suggestion's, an edit's note must be text: null is a
    // bad request, not a cleared note ("" clears it).
    const cleaned = typeof input.note === 'string' ? cleanNote(input.note) : null;
    if (cleaned === null) throw new ApiError(400, NOTE_ERROR);
    const [from] = await db.select({ id: suggestions.id }).from(suggestions).where(eq(suggestions.gameId, game.id));
    if (!from) throw new ApiError(400, 'only a game suggested on the site has a note');
    note = cleaned;
  }
  if (Object.keys(fields).length === 0 && note === undefined) throw new ApiError(400, 'nothing to change');
  row(gameRow, { ...game, ...fields }, `${game.name}'s row`);
  await db.transaction(async (tx) => {
    if (Object.keys(fields).length > 0) await tx.update(games).set(fields).where(eq(games.id, game.id));
    if (note !== undefined) await tx.update(suggestions).set({ note }).where(eq(suggestions.gameId, game.id));
  });
  const [listed] = (await wishlist(deps)).filter((g) => g.id === game.id);
  return listed;
}

/**
 * The owner taking a game off the wishlist. The row stays, as `removed`, so
 * old ids and links still resolve; a game that came from a suggestion takes
 * the suggestion with it.
 */
export async function removeGame(deps: SuggestionsDeps, id: unknown): Promise<void> {
  const db = await deps.db();
  const now = deps.now ?? (() => Date.now());
  const game = await loadGame(db, id);
  await db.transaction(async (tx) => {
    await tx.update(games).set({ status: 'removed' }).where(eq(games.id, game.id));
    await tx
      .update(suggestions)
      .set({ status: 'removed', decidedAt: now() })
      .where(and(eq(suggestions.gameId, game.id), eq(suggestions.status, 'approved')));
  });
}
