/**
 * How the API's BoardGameGeek lookup went for a game the owner is adding or
 * approved (`outcome` and `lookup` in api/_resolvers/suggestions.ts, mirrored here
 * since the two trees can't import each other).
 */
export type LookupOutcome = 'found' | 'no-match' | 'no-token' | 'refused' | 'unavailable';

/** Details BoardGameGeek has for a game, as the preview answers them. */
export interface PreviewDetails {
  bggId: number;
  /** BGG's name for the match, which may differ from what was typed. */
  name: string;
  year?: number;
  min: number;
  max: number;
  mins: number;
  desc: string;
  kw: string[];
  img?: string;
}

const CAUSE: Record<Exclude<LookupOutcome, 'found'>, (game: string) => string> = {
  'no-match': (game) => `BoardGameGeek had no match for “${game}”.`,
  'no-token': (game) => `“${game}” couldn't be looked up: the BoardGameGeek token (BGG_API_TOKEN) is missing.`,
  // A 401 or 403 is the token, or BGG's bot screening turning the request away.
  refused: (game) => `“${game}” couldn't be looked up: BoardGameGeek refused the request (check BGG_API_TOKEN).`,
  unavailable: (game) => `BoardGameGeek didn't answer for “${game}”.`,
};

// Before the add or the approval, the owner can still change the name or
// go ahead without details (`act`); after an approval the entry is stored,
// so Edit is what is left.
const ACT: Record<'preview' | 'queue', string> = { preview: 'add it anyway', queue: 'approve it' };
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const PREVIEW_ADVICE: Record<Exclude<LookupOutcome, 'found'>, (act: string) => string> = {
  'no-match': (act) => `Check the name and look it up again, or ${act} and fill in its details with Edit.`,
  'no-token': (act) =>
    `${capital(act)} and fill in its details with Edit, or set the token, redeploy, then look it up again.`,
  refused: (act) => `${capital(act)} and fill in its details with Edit, or check the token and look it up again.`,
  unavailable: (act) => `Look it up again in a minute, or ${act} and fill in its details with Edit.`,
};

/**
 * What to tell the owner when a lookup filled nothing in, and what to do
 * about it: on the add form's preview, a queued suggestion's preview, or
 * after an approval. Null when it found the game or none ran, so success
 * stays quiet.
 */
export function lookupNotice(
  outcome: LookupOutcome | undefined,
  game: string,
  context: 'preview' | 'queue' | 'approved',
): string | null {
  if (outcome === undefined || outcome === 'found' || !(outcome in CAUSE)) return null;
  const cause = CAUSE[outcome](game);
  return context === 'approved'
    ? `Approved, but ${cause} Fill in its details with Edit.`
    : `${cause} ${PREVIEW_ADVICE[outcome](ACT[context])}`;
}
