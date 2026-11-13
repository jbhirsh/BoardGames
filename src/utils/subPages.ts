import { ALL_GAMES } from '../data/games';
import { scorePadFor } from '../data/scoreCalculators';
import { rulebooks } from './rulebooks';

/**
 * Whether a sub-page's address opens the page itself rather than its
 * not-found page, decided before the page's code loads: the frame around a
 * page (components/PageFrame.tsx) draws the page's column and Back link only
 * for a page. ScoreCalculatorPage asks opensScorePad itself; RulesPage's two
 * not-found pages (no such game, no rulebook yet) are opensRulesPage's two
 * ways of being false.
 */

/** /rules/:slug: a game in the collection with a rulebook (a game on its way may have none yet). */
export function opensRulesPage(slug: string | undefined): boolean {
  const game = ALL_GAMES.find((g) => g.slug === slug);
  return game !== undefined && rulebooks(game).length > 0;
}

/** /score/:slug/:part?: a game with a pad, or a game inside it with one of its own. */
export function opensScorePad(slug: string | undefined, part: string | undefined): boolean {
  const game = ALL_GAMES.find((g) => g.slug === slug);
  if (!game || !scorePadFor(game.slug, part)) return false;
  return part === undefined || game.subgames?.some((s) => s.slug === part) === true;
}
