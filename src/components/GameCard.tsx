import { useId, useState } from 'react';
import { Link } from 'react-router';
import type { Game, KeywordId } from '../data/types';
import { isKeywordLit } from '../utils/keywordLit';
import { SCORE_CALCULATORS } from '../data/scoreCalculators';
import { useFilter } from '../context/useFilter';
import { ytURL, rulesURL } from '../utils/urls';
import { sortedKw } from '../utils/filterGames';
import KeywordPill from './KeywordPill';
import AwardsBadge, { AwardsList } from './AwardsBadge';
import SubGameList from './SubGameList';
import DifficultyMeta from './DifficultyMeta';
import Popover from './Popover';
import { fittingSubgames, subgameLabel } from '../utils/subgames';
import { rulesPathFor } from '../utils/rulebooks';
import { YouTubeIcon, AiRulesIcon, UserIcon, ClockIcon, CalculatorIcon, SearchIcon } from './Icons';

interface Props {
  game: Game;
}

export default function GameCard({ game }: Props) {
  const { state, dispatch } = useFilter();
  const [subsOpen, setSubsOpen] = useState(false);
  const subsId = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  // The button and its list go away while no game inside fits the filters.
  const fitting = game.subgames ? fittingSubgames(game.subgames, state) : [];
  const hasFitting = fitting.length > 0;
  const subsLabel = game.subgames ? subgameLabel(game.subgames, state) : '';

  return (
    // An open card (its write-up or its add-ons list) takes a grid row of its
    // own, so the cards that share its subgrid rows aren't stretched.
    <div className={`game-card${moreOpen || (subsOpen && hasFitting) ? ' card-open' : ''}`}>
      <div className="card-head">
        <img src={game.img} alt={`${game.name} box art`} className="card-corner-img" loading="lazy" />
        <h3 className="card-name">{game.name}</h3>
        <div className="card-meta">
          <span className="cmeta">
            <UserIcon /> {game.players}
          </span>
          <span className="cmeta">
            <ClockIcon /> {game.dur}
          </span>
          <DifficultyMeta item={game} />
        </div>
        <div className="card-kw">
          {sortedKw(game.kw).map((kw) => (
            <KeywordPill
              key={kw}
              keyword={kw as KeywordId}
              active={isKeywordLit(state, kw as KeywordId)}
              onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: kw as KeywordId })}
            />
          ))}
        </div>
      </div>
      <div className="card-body">
        {/* More opens the long write-up a list row shows when expanded. */}
        <p className="card-desc">
          {game.short}{' '}
          <button
            type="button"
            className="card-more"
            aria-expanded={moreOpen}
            aria-controls={moreId}
            aria-label={`${moreOpen ? 'Less' : 'More'} about ${game.name}`}
            onClick={() => setMoreOpen((o) => !o)}
          >
            {moreOpen ? 'Less' : 'More'}
          </button>
        </p>
        {moreOpen && (
          <div className="card-detail" id={moreId}>
            <div className="detail-section" dangerouslySetInnerHTML={{ __html: game.detail }} />
            {game.awards.length > 0 && (
              <div className="detail-section row-awards">
                <h3>Awards</h3>
                <AwardsList awards={game.awards} />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="card-foot">
        {/* What the card holds besides its own game sits bottom left, so
            every card's head carries the same things and lines up. */}
        <div className="card-foot-start">
          <AwardsBadge itemName={game.name} awards={game.awards} />
          {game.subgames && hasFitting && (
            <Popover
              className="sub-pill-wrap"
              buttonClassName="sub-pill"
              label={`${game.name}: ${subsLabel}`}
              title={`${game.name}: ${subsLabel}`}
              activate={{ onClick: () => setSubsOpen((o) => !o), expanded: subsOpen, controls: subsId }}
              trigger={(
                <>
                  <span className="sub-pill-full">{subsLabel}</span>
                  <span className="sub-pill-short">+{fitting.length}</span>
                  <svg className="sub-pill-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </>
              )}
            >
              <ul className="sub-tag-list">
                {fitting.map((s) => <li key={s.slug}>{s.name}</li>)}
              </ul>
            </Popover>
          )}
        </div>
        <div className="card-foot-end">
          {game.rules ? (
            <Link className="rules-btn rules-btn--primary" to={rulesPathFor(game, state)} title="Rules">
              <AiRulesIcon /> Rules
            </Link>
          ) : (
            <a
              className="rules-btn rules-btn--primary"
              href={rulesURL(game.name)}
              onClick={(e) => { e.preventDefault(); window.open(rulesURL(game.name), '_blank'); }}
              title="Rules"
            >
              <AiRulesIcon /> Rules
            </a>
          )}
          {SCORE_CALCULATORS.has(game.slug) && (
            <Link className="rules-btn" to={`/score/${game.slug}`} title="Score Calculator">
              <CalculatorIcon /> Score
            </Link>
          )}
          {game.slug === 'bananagrams' && (
            <Link className="rules-btn" to="/word-checker" title="Word Checker">
              <SearchIcon /> Word Checker
            </Link>
          )}
          <a
            className="row-yt"
            href={ytURL(game.yt)}
            onClick={(e) => { e.preventDefault(); window.open(ytURL(game.yt), '_blank'); }}
            title="Watch Tutorial"
            aria-label={`Watch ${game.name} tutorial on YouTube`}
          >
            <YouTubeIcon />
          </a>
        </div>
      </div>
      {game.subgames && hasFitting && subsOpen && (
        <div className="sub-panel" id={subsId}>
          <SubGameList game={{ ...game, subgames: game.subgames }} />
        </div>
      )}
    </div>
  );
}
