import { useId, useState } from 'react';
import { Link } from 'react-router';
import type { GameWithSubgames, SubGame } from '../data/types';
import { useItemFilter } from '../context/useFilter';
import { ytURL } from '../utils/urls';
import { rulebookPath } from '../utils/rulebooks';
import { fittingSubgames, shownKind, subgameNoun } from '../utils/subgames';
import { YouTubeIcon, AiRulesIcon, UserIcon, ClockIcon, CalculatorIcon } from './Icons';
import AwardsBadge from './AwardsBadge';
import ExternalLink from './ExternalLink';
import DifficultyMeta from './DifficultyMeta';
import GameDetail from './GameDetail';
import { FROM_LIST } from '../utils/fromList';
import { scorePadPath } from '../data/scoreCalculators';
import { detailTextClass, metaClass, tapTargetClass } from './sharedClasses';

interface Props {
  game: GameWithSubgames;
  /**
   * In an open list row or line, on its grey panel: each game set on the
   * page's colour, its lines in the write-up's text around it.
   */
  inRow?: boolean;
}

const linkClass = `sub-link grid size-8 place-items-center rounded-lg border border-border bg-surface text-text2 [transition:color_0.15s,border-color_0.15s,background_0.15s] [&_svg]:block [&_svg]:size-3.5 ${tapTargetClass}`;
const toolLinkClass = `${linkClass} hover:border-blue-tint/30 hover:bg-blue-bg hover:text-blue`;
// The video's: YouTube's red glyph, and a quieter hover.
const videoLinkClass = `${linkClass} sub-yt shrink-0 justify-center can-hover:hover:border-border-hover can-hover:hover:bg-bg2 [&_svg]:shrink-0 [&_svg]:fill-yt-red`;

/**
 * The games inside a game (Catan's add-ons, the games a deck plays), each with
 * its own players, time, rules and video, and a score pad where it has one
 * (a deck's Hearts). Only the ones that fit the players and time filters
 * are listed.
 */
export default function SubGameList({ game, inRow = false }: Props) {
  const filter = useItemFilter();
  return (
    <ul
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-x-2.5 gap-y-1.5"
      aria-label={`${game.name} ${subgameNoun(game.subgames, 2)}`}
    >
      {fittingSubgames(game.subgames, filter).map((sub) => (
        <SubGameRow key={sub.slug} parent={game.slug} sub={sub} inRow={inRow} />
      ))}
    </ul>
  );
}

/**
 * One game in the list. One that has more to say than its line (an
 * expansion's full description and what it adds) opens in place to show it.
 */
// An add-on's kind: an expansion's amber, an extension's green, a version's blue.
const kindClasses: Record<string, string> = {
  expansion: 'bg-expansion-tint/12 text-expansion-fg',
  extension: 'bg-extension-tint/12 text-extension-fg',
  version: 'bg-blue-tint/10 text-version-fg',
};

function SubGameRow({ parent, sub, inRow }: { parent: string; sub: SubGame; inRow: boolean }) {
  const [open, setOpen] = useState(false);
  const moreId = useId();
  const kind = shownKind(sub.name, sub.kind);
  const hasMore = sub.desc !== undefined || sub.detail !== undefined;
  const scorePath = scorePadPath(parent, sub.slug);
  return (
    // The name and the links share the first line; the rest runs the row's width.
    <li
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-0.75 rounded-control border border-border px-2.5 py-2.25 ${inRow ? 'bg-bg' : 'bg-surface'}`}
    >
      <div className="contents">
        <span className="sub-name col-1 row-1 flex flex-wrap items-center gap-1.75 self-center text-[13.5px] font-semibold text-dark">
          {sub.name}
          {kind && (
            <span
              className={`kind-chip kind-${kind} rounded-[5px] px-1.5 py-0.5 text-[9.5px] leading-[1.3] font-bold tracking-[0.6px] whitespace-nowrap uppercase ${kindClasses[kind]}`}
            >
              {kind}
            </span>
          )}
        </span>
        <span className="col-span-full flex flex-wrap gap-x-3 gap-y-1">
          <span className={metaClass}>
            <UserIcon /> {sub.players}
          </span>
          <span className={metaClass}>
            <ClockIcon /> {sub.dur}
          </span>
          <DifficultyMeta item={sub} />
          <AwardsBadge itemName={sub.name} awards={sub.awards ?? []} />
        </span>
        <p className={`col-span-full ${inRow ? detailTextClass : 'text-[12px] leading-[1.55] text-text2'}`}>
          {sub.short}
        </p>
        {hasMore && (
          <>
            <button
              type="button"
              className="col-span-full mt-0.5 cursor-pointer place-self-start text-[11.5px] font-semibold text-blue hover:underline"
              aria-expanded={open}
              aria-controls={moreId}
              aria-label={`${open ? 'Less' : 'More'} about ${sub.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => !o);
              }}
            >
              {open ? 'Less' : 'More'}
            </button>
            <div id={moreId} className="col-span-full mt-1.5 border-t border-border pt-2" hidden={!open}>
              {open && sub.desc && (
                <p className={`sub-desc mb-2.5 ${inRow ? detailTextClass : 'text-[12.5px] leading-[1.65] text-text'}`}>
                  {sub.desc}
                </p>
              )}
              {open && sub.detail && (
                <div className="[&>.detail-section]:mb-2.5 [&>.detail-section:last-child]:mb-0">
                  <GameDetail sections={sub.detail} small />
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <div className="sub-links col-2 row-1 flex shrink-0 gap-1">
        {sub.rules && (
          <Link
            className={toolLinkClass}
            to={rulebookPath(parent, sub.slug)}
            state={FROM_LIST}
            aria-label={`${sub.name} rules`}
            title="Rules"
            onClick={(e) => e.stopPropagation()}
          >
            <AiRulesIcon size={14} />
          </Link>
        )}
        {scorePath && (
          <Link
            className={toolLinkClass}
            to={scorePath}
            state={FROM_LIST}
            aria-label={`${sub.name} score pad`}
            title="Score"
            onClick={(e) => e.stopPropagation()}
          >
            <CalculatorIcon />
          </Link>
        )}
        <ExternalLink
          className={videoLinkClass}
          href={ytURL(sub.yt)}
          aria-label={`Watch ${sub.name} tutorial on YouTube`}
          title="Watch Tutorial"
        >
          <YouTubeIcon />
        </ExternalLink>
      </div>
    </li>
  );
}
