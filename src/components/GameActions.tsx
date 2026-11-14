import { Link } from 'react-router';
import type { MouseEvent } from 'react';
import type { Game } from '../data/types';
import { SCORE_CALCULATORS } from '../data/scoreCalculators';
import { WORD_CHECKER_GAME } from '../data/wordChecker';
import { ytURL } from '../utils/urls';
import { FROM_LIST } from '../utils/fromList';
import RulesLink from './RulesLink';
import ExternalLink from './ExternalLink';
import { YouTubeIcon, CalculatorIcon, SearchIcon } from './Icons';
import { actionButtonClass, cardFootEndClass, rowFootClass, videoButtonClass } from './sharedClasses';

interface Props {
  game: Game;
  /** A card's footer, or the foot of an open list row or phone line. */
  variant: 'card' | 'row';
  /**
   * Score and the word checker as their icon alone, their word kept for
   * screen readers and in the tooltip: a narrow card's footer that also holds
   * the add-ons button, which can't fit them in full (#324).
   */
  iconsOnly?: boolean;
}

// The click stops at the link, so nothing around the bar acts on it as well
// (the bar sits beside a list row's toggle, not inside it, but a card or row
// that gained a click handler later shouldn't fire on a link's click).
const stop = (e: MouseEvent) => e.stopPropagation();

// Rules and the game's tools: the footer actions' size and radius, the 44px
// tap on a phone, and their icons at 14px.
const rulesButtonClass = `rules-btn ${actionButtonClass} [&_svg]:block [&_svg]:size-3.5 [&_svg]:shrink-0`;
// Rules, filled. Its icon's lines are cut in the fill (--icon-cut).
const primaryClass =
  'border-blue-fill bg-blue-fill font-semibold text-on-fill [--icon-cut:var(--color-blue-fill)] hover:border-blue-fill-hover hover:bg-blue-fill-hover hover:text-on-fill hover:[--icon-cut:var(--color-blue-fill-hover)]';
// The rest, quiet until hovered.
const secondaryClass =
  'border-border bg-surface font-medium text-text2 hover:border-blue-tint/30 hover:bg-blue-bg hover:text-blue';

/**
 * A game's actions, the same on a card, an open list row and an open phone
 * line: Rules filled, then the game's own tools (its score calculator, the word
 * checker) and its tutorial video. Only a card's carry tooltips. Rules is
 * the one filled button on a card or open row; the rest, like a wishlist
 * entry's cart, share one quiet outline (the video's play
 * glyph in --yt-red), and every footer button one size and radius (44px on
 * a phone).
 */
export default function GameActions({ game, variant, iconsOnly = false }: Props) {
  const card = variant === 'card';
  return (
    <div className={card ? cardFootEndClass : rowFootClass}>
      <RulesLink game={game} className={`rules-btn--primary ${rulesButtonClass} ${primaryClass}`} />
      {SCORE_CALCULATORS.has(game.slug) && (
        <Link
          className={`${rulesButtonClass} ${secondaryClass}`}
          to={`/score/${game.slug}`}
          state={FROM_LIST}
          title={card ? 'Score Calculator' : undefined}
          onClick={stop}
        >
          <CalculatorIcon /> <span className={iconsOnly ? 'sr-only' : undefined}>Score</span>
        </Link>
      )}
      {game.slug === WORD_CHECKER_GAME && (
        <Link
          className={`${rulesButtonClass} ${secondaryClass}`}
          to="/word-checker"
          state={FROM_LIST}
          title={card ? 'Word Checker' : undefined}
          onClick={stop}
        >
          <SearchIcon /> <span className={iconsOnly ? 'sr-only' : undefined}>Word Checker</span>
        </Link>
      )}
      <ExternalLink
        className={`row-yt ${videoButtonClass}`}
        href={ytURL(game.yt)}
        title={card ? 'Watch Tutorial' : undefined}
        aria-label={`Watch ${game.name} tutorial on YouTube`}
      >
        <YouTubeIcon />
      </ExternalLink>
    </div>
  );
}
