import { memo, useId, useState } from 'react';
import type { Game } from '../data/types';
import { useFilterDispatch, useItemFilter } from '../context/useFilter';
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
import {
  cardBodyClass,
  cardClass,
  cardDescClass,
  cardFootClass,
  cardFootStartClass,
  cardHeadClass,
  cardMetaClass,
  cardMoreClass,
  cardNameClass,
  cornerArtClass,
  labelPillClass,
  metaClass,
  tagsClass,
} from './sharedClasses';

interface Props {
  game: Game;
}

/**
 * A collection game in the grid. The card spans four subgrid rows of the
 * grid (sharedClasses.ts' cardClass), so heads and footers line up across a
 * row. More opens the
 * write-up and awards. A game with games inside it has a button bottom left,
 * beside the award count, named by kind ("+2 expansions", "1 of 12 games
 * fit" under a filter; just "+N" on a narrow card), that lists the names on
 * hover and opens the ones that fit (SubGameList) under the footer. The
 * footer ends with GameActions. Memoized: a filter change that leaves this
 * game as it was doesn't redraw it.
 */
export default memo(GameCard);

function GameCard({ game }: Props) {
  const filter = useItemFilter();
  const dispatch = useFilterDispatch();
  const [subsOpen, setSubsOpen] = useState(false);
  const subsId = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  // The button and its list go away while no game inside fits the filters.
  const fitting = game.subgames ? fittingSubgames(game.subgames, filter) : [];
  const hasFitting = fitting.length > 0;
  const subsLabel = game.subgames ? subgameLabel(game.subgames, filter) : '';

  return (
    // An open card (its write-up or its add-ons list) takes a grid row of its
    // own, so the cards that share its subgrid rows aren't stretched. The
    // id is where the hero's cover for this game leads, and the name takes
    // focus there.
    // It takes the full row, the cards after it keeping their order.
    <div
      id={gameAnchor(game.slug)}
      className={`game-card ${cardClass} ${moreOpen || (subsOpen && hasFitting) ? 'card-open col-span-full' : ''}`}
    >
      <div className={cardHeadClass}>
        <img src={game.img} alt={`${game.name} box art`} className={cornerArtClass} loading="lazy" />
        <h3 className={`${cardNameClass} pr-(--corner-clear)`} tabIndex={-1} data-focus-target="item">
          {game.name}
        </h3>
        <div className={`${cardMetaClass} pr-(--corner-clear)`}>
          <span className={metaClass}>
            <UserIcon /> {game.players}
          </span>
          <span className={metaClass}>
            <ClockIcon /> {game.dur}
          </span>
          <DifficultyMeta item={game} />
        </div>
        {game.arriving && (
          <p className="pt-2 pr-(--corner-clear)">
            <span className={`${labelPillClass} rounded-[999px]`}>Arriving {game.arriving}</span>
          </p>
        )}
        <div className={`${tagsClass} pt-2 pr-(--corner-clear)`}>
          {sortedKw(game.kw).map((kw) => (
            <KeywordPill
              key={kw}
              keyword={kw}
              active={filter.lit.has(kw)}
              onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: kw })}
            />
          ))}
        </div>
      </div>
      <div className={cardBodyClass}>
        {/* More opens the long write-up a list row shows when expanded. */}
        <p className={cardDescClass}>
          {game.short}{' '}
          <button
            type="button"
            className={cardMoreClass}
            aria-expanded={moreOpen}
            aria-controls={moreId}
            aria-label={`${moreOpen ? 'Less' : 'More'} about ${game.name}`}
            onClick={() => setMoreOpen((o) => !o)}
          >
            {moreOpen ? 'Less' : 'More'}
          </button>
        </p>
        {moreOpen && (
          // With the full row to fill, the write-up runs in columns of a
          // comfortable line length, as many as the row holds (one on a phone).
          <div
            className="mt-2.5 columns-[36ch] gap-x-10 border-t border-border pt-3 *:break-inside-avoid [&>.detail-section]:mb-3 [&>.detail-section:last-child]:mb-0"
            id={moreId}
          >
            <GameDetail sections={game.detail} />
            <AwardsSection awards={game.awards} />
          </div>
        )}
      </div>
      <div className={cardFootClass}>
        {/* What the card holds besides its own game sits bottom left, so
            every card's head carries the same things and lines up. */}
        <div className={cardFootStartClass}>
          <AwardsBadge itemName={game.name} awards={game.awards} />
          {game.subgames && hasFitting && (
            <Popover
              className="inline-flex"
              buttonClassName={() =>
                'group/pill inline-flex cursor-pointer items-center gap-1.5 rounded-[999px] border border-blue-tint/25 bg-blue-bg px-2.75 py-1.25 text-[11.5px] font-semibold text-blue [transition:background_0.15s,border-color_0.15s] hover:border-blue-tint/40 hover:bg-blue-bg2'
              }
              label={`${game.name}: ${subsLabel}`}
              title={`${game.name}: ${subsLabel}`}
              activate={{ onClick: () => setSubsOpen((o) => !o), expanded: subsOpen, controls: subsId }}
              trigger={
                <>
                  {/* On a footer too narrow for the full label beside the award
                      count and the actions, just the count. */}
                  <span className="sub-pill-full [@container_(max-width:323px)]:hidden">{subsLabel}</span>
                  <span className="sub-pill-short hidden [@container_(max-width:323px)]:inline">+{fitting.length}</span>
                  <svg
                    className="[transition:transform_0.2s] group-aria-expanded/pill:transform-[rotate(180deg)]"
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    aria-hidden="true"
                  >
                    <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </>
              }
            >
              <ul className="flex flex-col gap-0.75 text-[12px] leading-normal text-text2">
                {fitting.map((s) => (
                  <li key={s.slug}>{s.name}</li>
                ))}
              </ul>
            </Popover>
          )}
        </div>
        <GameActions game={game} variant="card" />
      </div>
      {hasSubgames(game) && hasFitting && subsOpen && (
        <div className="row-4 self-start border-t border-border bg-bg2 p-2" id={subsId}>
          <SubGameList game={game} />
        </div>
      )}
    </div>
  );
}
