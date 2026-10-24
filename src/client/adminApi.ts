// The owner's calls to the API (api/graphql.ts, through client/graphql.ts),
// each a typed document from src/gql/: on the site, signed in, and from the
// pages the emailed approve and deny links open, with the link's token. Every failure resolves to a message
// the form can show rather than throwing into React. The API's shapes are
// turned into the ones the admin controls work with: BoardGameGeek's
// outcome in utils/lookupNotice.ts's words, and absent fields undefined
// rather than null.

import {
  AddGameDocument,
  DecideByLinkDocument,
  DecideSuggestionDocument,
  EmailedSuggestionDocument,
  EditSuggestionDocument,
  PendingSuggestionsDocument,
  PreviewGameDocument,
  RemoveSuggestionDocument,
  type LookupOutcome as ApiOutcome,
  type PreviewFragment,
  type SuggestionStatus,
} from '../gql/graphql';
import type { LookupOutcome, PreviewDetails } from '../utils/lookupNotice';
import { request, type Result } from './graphql';

export type Outcome<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const OUTCOMES: Record<ApiOutcome, LookupOutcome> = {
  FOUND: 'found',
  NO_MATCH: 'no-match',
  NO_TOKEN: 'no-token',
  REFUSED: 'refused',
  UNAVAILABLE: 'unavailable',
};

/** A request's result with its data reshaped, or its error as it came. */
function map<T, U>(result: Result<T>, shape: (data: T) => U): Outcome<U> {
  return result.ok ? { ok: true, data: shape(result.data) } : { ok: false, error: result.error };
}

const done = () => undefined;

/** The parts of a preview an entry keeps: BGG's name for the match was for the owner to see. */
const storedDetails = (d: PreviewDetails) => ({
  bggId: d.bggId,
  year: d.year,
  min: d.min,
  max: d.max,
  mins: d.mins,
  desc: d.desc,
  kw: d.kw,
  img: d.img,
});

export interface PendingSuggestion {
  id: string;
  game: string;
  name: string;
  note: string;
}

export async function fetchPending(signal?: AbortSignal): Promise<PendingSuggestion[]> {
  const result = await request(PendingSuggestionsDocument, {}, signal);
  if (!result.ok) throw new Error('fetch failed');
  return result.data.pendingSuggestions;
}

/** What an approval answers besides the item: how its BoardGameGeek lookup went. */
export interface LookedUp {
  lookup?: LookupOutcome;
}

const lookedUp = (lookup: ApiOutcome | null): LookedUp => (lookup ? { lookup: OUTCOMES[lookup] } : {});

/**
 * What the owner settled on before approving: a corrected name, and what the
 * preview found for it (null for nothing). Leave `details` out when no
 * preview came back, and the server looks the game up itself.
 */
export interface ApprovalChoice {
  game?: string;
  details?: PreviewDetails | null;
}

export const decideSuggestion = async (
  id: string,
  decision: 'approve' | 'deny',
  { game, details }: ApprovalChoice = {},
): Promise<Outcome<LookedUp>> =>
  map(
    await request(DecideSuggestionDocument, {
      id,
      decision: decision === 'approve' ? 'APPROVE' : 'DENY',
      game,
      ...(details !== undefined ? { details: details && storedDetails(details) } : {}),
    }),
    (data) => lookedUp(data.decideSuggestion.lookup),
  );

export interface Preview {
  outcome: LookupOutcome;
  details?: PreviewDetails;
}

/** A preview as the admin controls read it. */
function toPreview({ outcome, details }: PreviewFragment): Preview {
  return {
    outcome: OUTCOMES[outcome],
    ...(details ? { details: { ...details, year: details.year ?? undefined, img: details.img ?? undefined } } : {}),
  };
}

/** Looks a game up on BoardGameGeek without storing anything, for the add form and the queue to show. */
export const previewGame = async (game: string, signal?: AbortSignal): Promise<Outcome<Preview>> =>
  map(await request(PreviewGameDocument, { game }, signal), (data) => toPreview(data.previewGame));

export interface AddGameInput {
  game: string;
  name: string;
  note: string;
  type: string | null;
  /** What the preview found, or null to add it without details. */
  details: PreviewDetails | null;
}

export const addGame = async ({ game, name, note, type, details }: AddGameInput): Promise<Outcome> =>
  map(
    await request(AddGameDocument, {
      game,
      name,
      note,
      ...(type ? { type } : {}),
      details: details && storedDetails(details),
    }),
    done,
  );

export interface EditGameInput {
  id: string;
  game: string;
  details: { min: number; max: number; mins: number; desc: string; kw: string[]; type: string | null };
}

export const editGame = async ({ id, game, details }: EditGameInput): Promise<Outcome> =>
  map(await request(EditSuggestionDocument, { id, game, details }), done);

export const removeGame = async (id: string): Promise<Outcome> =>
  map(await request(RemoveSuggestionDocument, { id }), done);

/** An emailed link's suggestion, and for an approval what BoardGameGeek has for it (or for `game`). */
export interface Emailed {
  game: string;
  name: string;
  note: string;
  /** Lower case, as the pages say it: pending, approved, denied, unsent, removed. */
  status: string;
  /** Still waiting on a decision. */
  open: boolean;
  /** Null once decided, with no lookup configured, or for a denial. */
  preview: Preview | null;
}

/** Why an emailed link can't be used, or what went wrong: the API's message and code. */
export type LinkOutcome<T> = { ok: true; data: T } | { ok: false; error: string; code?: string; status?: string };

const OPEN: SuggestionStatus[] = ['PENDING', 'UNSENT'];

/** Reads an emailed link's suggestion; changes nothing. */
export async function openEmailed(
  { id, token, game, decision }: { id: string; token: string; game?: string; decision: 'approve' | 'deny' },
  signal?: AbortSignal,
): Promise<LinkOutcome<Emailed>> {
  const result = await request(
    EmailedSuggestionDocument,
    { id, token, game, withPreview: decision === 'approve' },
    signal,
  );
  if (!result.ok) return result;
  const { suggestion, preview } = result.data.emailedSuggestion;
  return {
    ok: true,
    data: {
      game: suggestion.game,
      name: suggestion.name,
      note: suggestion.note,
      status: suggestion.status.toLowerCase(),
      open: OPEN.includes(suggestion.status),
      preview: preview ? toPreview(preview) : null,
    },
  };
}

/** Decides from an emailed link, with what its page showed. */
export async function decideByLink({
  id,
  token,
  decision,
  game,
  details,
}: { id: string; token: string; decision: 'approve' | 'deny' } & ApprovalChoice): Promise<LinkOutcome<LookedUp>> {
  const result = await request(DecideByLinkDocument, {
    id,
    token,
    decision: decision === 'approve' ? 'APPROVE' : 'DENY',
    game,
    ...(details !== undefined ? { details: details && storedDetails(details) } : {}),
  });
  return result.ok ? { ok: true, data: lookedUp(result.data.decideSuggestion.lookup) } : result;
}
