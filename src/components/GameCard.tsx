import { useId, useState } from 'react';
import type { Game } from '../data/types';
import { isKeywordLit } from '../utils/keywordLit';
import { useFilter } from '../context/useFilter';
import { sortedKw } from '../utils/filterGames';
import KeywordPill from './KeywordPill';
import AwardsBadge, { AwardsSection } from './AwardsBadge';
import SubGameList from './SubGameList';
import DifficultyMeta from './DifficultyMeta';
import GameActions from './GameActions';
import GameDetail from './GameDetail';
import Popover from './Popover';
import { fittingSubgames, hasSubgames, subgameLabel } from '../utils/subgames';
import { gameAnchor } from '../utils/heroCovers';
import { UserIcon, ClockIcon } from './Icons';

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
    // own, so the cards that share its subgrid rows aren't stretched. The
    // id is where the hero's cover for this game leads, and the name takes
    // focus there.
    <div id={gameAnchor(game.slug)} className={`game-card${moreOpen || (subsOpen && hasFitting) ? ' card-open' : ''}`}>
      <div className="card-head">
        <img src={game.img} alt={`${game.name} box art`} className="card-corner-img" loading="lazy" />
        <h3 className="card-name" tabIndex={-1} data-focus-target="item">{game.name}</h3>
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
              keyword={kw}
              active={isKeywordLit(state, kw)}
              onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: kw })}
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
            <GameDetail sections={game.detail} />
            <AwardsSection awards={game.awards} />
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
        <GameActions game={game} variant="card" />
      </div>
      {hasSubgames(game) && hasFitting && subsOpen && (
        <div className="sub-panel" id={subsId}>
          <SubGameList game={game} />
        </div>
      )}
    </div>
  );
}
