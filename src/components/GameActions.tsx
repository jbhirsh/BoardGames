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

interface Props {
  game: Game;
  /** A card's footer, or the foot of an open list row. */
  variant: 'card' | 'row';
}

// The click stops at the link, so nothing around the bar acts on it as well
// (the bar sits beside a list row's toggle, not inside it, but a card or row
// that gained a click handler later shouldn't fire on a link's click).
const stop = (e: MouseEvent) => e.stopPropagation();

/**
 * A game's actions, the same on a card and on an open list row: Rules
 * filled, then the game's own tools (its score calculator, the word
 * checker) and its tutorial video. Only a card's carry tooltips. Rules is
 * the one filled button on a card or open row; the rest, like a wishlist
 * entry's cart and price history, share one quiet outline (the video's play
 * glyph in --yt-red), and every footer button one size and radius (44px on
 * a phone, App.css).
 */
export default function GameActions({ game, variant }: Props) {
  const card = variant === 'card';
  return (
    <div className={card ? 'card-foot-end' : 'row-expand-foot'}>
      <RulesLink game={game} className="rules-btn rules-btn--primary" />
      {SCORE_CALCULATORS.has(game.slug) && (
        <Link className="rules-btn" to={`/score/${game.slug}`} state={FROM_LIST} title={card ? 'Score Calculator' : undefined} onClick={stop}>
          <CalculatorIcon /> Score
        </Link>
      )}
      {game.slug === WORD_CHECKER_GAME && (
        <Link className="rules-btn" to="/word-checker" state={FROM_LIST} title={card ? 'Word Checker' : undefined} onClick={stop}>
          <SearchIcon /> Word Checker
        </Link>
      )}
      <ExternalLink
        className="row-yt"
        href={ytURL(game.yt)}
        title={card ? 'Watch Tutorial' : undefined}
        aria-label={`Watch ${game.name} tutorial on YouTube`}
      >
        <YouTubeIcon />
      </ExternalLink>
    </div>
  );
}
