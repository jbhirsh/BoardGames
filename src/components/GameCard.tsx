import { memo, useId, useState } from 'react';
import type { Game } from '../data/types';
import { useFilterDispatch, useItemFilter } from '../context/useFilter';
import { sortedKw, tableFiltered } from '../utils/filterGames';
import KeywordPill from './KeywordPill';
import AwardsBadge, { AwardsSection } from './AwardsBadge';
import SubGameList from './SubGameList';
import DifficultyMeta, { WaitingBar } from './DifficultyMeta';
import { useGames } from '../context/useGames';
import { waitingForBgg } from '../utils/bggInfo';
import GameActions from './GameActions';
import GameDetail from './GameDetail';
import Popover from './Popover';
import { fittingSubgames, hasSubgames, subgameLabel } from '../utils/subgames';
import { gameAnchor } from '../utils/heroCovers';
import { useNarrow } from '../hooks/useNarrow';
import { UserIcon, ClockIcon } from './Icons';
import {
  actionButtonClass,
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
  cornerClass,
  labelPillClass,
  metaClass,
  stickerClass,
  stickerHeadClass,
  tagsClass,
} from './sharedClasses';

interface Props {
  game: Game;
}

/**
 * A collection game in the grid. The card spans four subgrid rows of the
 * grid (sharedClasses.ts' cardClass), so heads and footers line up across a
 * row. The award pill sits on the box art, like a sticker (#324). More opens
 * the write-up and awards. The footer is one row of same-height buttons: a
 * game with games inside it has a button bottom left, named by kind ("+2
 * expansions"; just "+2" on a narrow card, and "1 of 12" under a filter, its
 * name always the full "1 of 12 games fit"), that lists the names on hover
 * and opens the ones that fit (SubGameList) under the footer; GameActions
 * ends it, with Score or the word checker as its icon alone on a narrow card
 * that has the button. Memoized: a filter change that leaves this game as it
 * was doesn't redraw it.
 */
export default memo(GameCard);

function GameCard({ game }: Props) {
  const { loaded } = useGames();
  const waiting = waitingForBgg(game, loaded);
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
  // A footer too narrow for the add-ons button's full label beside the
  // actions (its content box at 323px or less). Under a filter the label is
  // always short: "1 of 3 expansions fit" overflows even a phone's footer.
  const [footNarrow, footRef] = useNarrow(323);
  const filtered = tableFiltered(filter);
  // Its words start the button's name, so a voice user can say what they see.
  const shortLabel = filtered ? `${fitting.length} of ${game.subgames?.length ?? 0}` : `+${fitting.length}`;

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
      <div className={`${cardHeadClass} ${stickerHeadClass}`}>
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
        <div className={cornerClass}>
          <img src={game.img} alt={`${game.name} box art`} className={cornerArtClass} loading="lazy" />
          <div className={stickerClass}>
            {/* The awards come with the games query; a bar waits for them on a first visit. */}
            {waiting.awards ? (
              <WaitingBar className="w-10" />
            ) : (
              <AwardsBadge itemName={game.name} awards={game.awards} sticker />
            )}
          </div>
        </div>
      </div>
      <div className={cardBodyClass}>
        {/* More opens the long write-up a list row shows when expanded. */}
        <p className={cardDescClass}>
          {/* A game the owner picked for BGG's summary waits for it on a
              first visit, a bar in its own line's place. */}
          {waiting.summary ? <WaitingBar className="w-full" /> : game.short}{' '}
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
      <div className={cardFootClass} ref={footRef}>
        {game.subgames && hasFitting && (
          <div className={cardFootStartClass}>
            <Popover
              className="inline-flex"
              buttonClassName={() =>
                `group/pill ${actionButtonClass} cursor-pointer border-blue-tint/25 bg-blue-bg font-semibold text-blue hover:border-blue-tint/40 hover:bg-blue-bg2`
              }
              label={`${game.name}: ${subsLabel}`}
              title={`${game.name}: ${subsLabel}`}
              activate={{ onClick: () => setSubsOpen((o) => !o), expanded: subsOpen, controls: subsId }}
              trigger={
                <>
                  {/* On a footer too narrow for the full label, just the count.
                      Only the one shown is rendered, so it alone is the
                      pill's text; the button's name gives the full label. */}
                  {footNarrow || filtered ? (
                    <span className="sub-pill-short">{shortLabel}</span>
                  ) : (
                    <span className="sub-pill-full">{subsLabel}</span>
                  )}
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
          </div>
        )}
        <GameActions game={game} variant="card" iconsOnly={footNarrow && hasFitting} />
      </div>
      {hasSubgames(game) && hasFitting && subsOpen && (
        <div className="row-4 self-start border-t border-border bg-bg2 p-2" id={subsId}>
          <SubGameList game={game} />
        </div>
      )}
    </div>
  );
}
