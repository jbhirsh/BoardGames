/**
 * What the pages behind the owner's emailed links say
 * (components/EmailedDecisionPage.tsx, components/SignInConfirmPage.tsx),
 * in the words the API's own confirmation pages used before they moved
 * into the app: why a link can't be used, why BoardGameGeek has nothing
 * for a game and what approving does about it, and what an approval did.
 */
import type { LookupOutcome, PreviewDetails } from './lookupNotice';

/** What a link the API refused is called, by the error's code. */
const PROBLEMS: Record<string, string> = {
  BAD_REQUEST: 'Link not recognised',
  NOT_FOUND: 'Suggestion not found',
  FORBIDDEN: 'Link not valid',
  BAD_NAME: 'Name not recognised',
};

/** The heading for a link (or a corrected name) the API refused. */
export const linkProblem = (code: string | undefined): string =>
  (code !== undefined && PROBLEMS[code]) || 'Something went wrong';

type Miss = Exclude<LookupOutcome, 'found'>;

// Why the approve page has no preview to show, for the name it looked up.
const PREVIEW_MISSES: Record<Miss, (game: string) => string> = {
  'no-match': (game) => `BoardGameGeek had no match for “${game}”.`,
  'no-token': (game) => `“${game}” couldn't be looked up: BGG_API_TOKEN isn't set.`,
  refused: (game) => `“${game}” couldn't be looked up: BoardGameGeek refused the request (check BGG_API_TOKEN).`,
  unavailable: (game) => `BoardGameGeek didn't answer for “${game}”.`,
};

/**
 * Why the approve page has nothing to show for `game`, and what approving
 * does about it: after an outage the approval tries the lookup again;
 * otherwise it adds the game without details.
 */
export function missText(game: string, outcome: Miss): string {
  const advice =
    outcome === 'unavailable'
      ? 'Approving tries again, and adds it without details if BoardGameGeek still has nothing; or look it up again below.'
      : 'Approving adds it without details, to fill in with Edit on the site; or correct the name below and look it up again.';
  return `${PREVIEW_MISSES[outcome](game)} ${advice}`;
}

/**
 * The details an approval from the page sends: what the preview showed
 * (the caller drops BGG's name for it), null when it found nothing, so the
 * game is approved without any rather than looked up again, and none at
 * all (undefined) when BoardGameGeek didn't answer or no preview came, so
 * the approval looks it up itself.
 */
export function approvalDetails(
  preview: { outcome: LookupOutcome; details?: PreviewDetails } | null,
): PreviewDetails | null | undefined {
  if (!preview || preview.outcome === 'unavailable') return undefined;
  return preview.outcome === 'found' && preview.details ? preview.details : null;
}

// What the approval says when the lookup filled nothing in, so the owner
// hears about it where they approved rather than from an empty card.
const LOOKUP_NOTES: Record<Miss, string> = {
  'no-match':
    'BoardGameGeek had no match for it, so it has no players, time or description yet: sign in on the site to fill them in with Edit.',
  'no-token':
    "It couldn't be looked up on BoardGameGeek because BGG_API_TOKEN isn't set, so it has no details yet: sign in on the site to fill them in with Edit.",
  refused:
    'BoardGameGeek refused the request (check BGG_API_TOKEN), so it has no details yet: sign in on the site to fill them in with Edit.',
  unavailable: "BoardGameGeek didn't answer, so it has no details yet: sign in on the site to fill them in with Edit.",
};

/** What an approval did: on the wishlist, credited to its suggester, and what it still lacks. */
export function approvedText(
  game: string,
  name: string,
  lookup: LookupOutcome | undefined,
  details: PreviewDetails | null | undefined,
): string {
  let note = '';
  if (lookup && lookup !== 'found') note = ` ${LOOKUP_NOTES[lookup]}`;
  else if (details === null) note = ' It has no details yet: sign in on the site to fill them in with Edit.';
  return `${game} is now on the wishlist, credited to ${name}.${note}`;
}

/** A link's token taken out of a URL, so page views and error reports never carry one. */
export function withoutToken(url: string): string {
  const parsed = new URL(url, 'https://x.invalid');
  if (!parsed.searchParams.has('token')) return url;
  parsed.searchParams.delete('token');
  const rest = parsed.searchParams.toString();
  const path = `${parsed.pathname}${rest ? `?${rest}` : ''}${parsed.hash}`;
  return parsed.origin === 'https://x.invalid' ? path : `${parsed.origin}${path}`;
}
