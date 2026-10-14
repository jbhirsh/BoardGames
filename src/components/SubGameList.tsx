import { useId, useState } from 'react';
import { Link } from 'react-router';
import type { GameWithSubgames, SubGame } from '../data/types';
import { useItemFilter } from '../context/useFilter';
import { ytURL } from '../utils/urls';
import { rulebookPath } from '../utils/rulebooks';
import { fittingSubgames, shownKind, subgameNoun } from '../utils/subgames';
import { YouTubeIcon, AiRulesIcon, UserIcon, ClockIcon } from './Icons';
import AwardsBadge from './AwardsBadge';
import ExternalLink from './ExternalLink';
import DifficultyMeta from './DifficultyMeta';
import GameDetail from './GameDetail';
import { FROM_LIST } from '../utils/fromList';

interface Props {
  game: GameWithSubgames;
}

/**
 * The games inside a game (Catan's add-ons, the games a deck plays), each with
 * its own players, time, rules and video. Only the ones that fit the players
 * and time filters are listed.
 */
export default function SubGameList({ game }: Props) {
  const filter = useItemFilter();
  return (
    <ul className="sub-list" aria-label={`${game.name} ${subgameNoun(game.subgames, 2)}`}>
      {fittingSubgames(game.subgames, filter).map((sub) => (
        <SubGameRow key={sub.slug} parent={game.slug} sub={sub} />
      ))}
    </ul>
  );
}

/**
 * One game in the list. One that has more to say than its line (an
 * expansion's full description and what it adds) opens in place to show it.
 */
function SubGameRow({ parent, sub }: { parent: string; sub: SubGame }) {
  const [open, setOpen] = useState(false);
  const moreId = useId();
  const kind = shownKind(sub.name, sub.kind);
  const hasMore = sub.desc !== undefined || sub.detail !== undefined;
  return (
    <li className="sub-row">
      <div className="sub-main">
        <span className="sub-name">
          {sub.name}
          {kind && <span className={`kind-chip kind-${kind}`}>{kind}</span>}
        </span>
        <span className="sub-meta">
          <span className="cmeta"><UserIcon /> {sub.players}</span>
          <span className="cmeta"><ClockIcon /> {sub.dur}</span>
          <DifficultyMeta item={sub} />
          <AwardsBadge itemName={sub.name} awards={sub.awards ?? []} />
        </span>
        <p className="sub-short">{sub.short}</p>
        {hasMore && (
          <>
            <button
              type="button"
              className="sub-more-btn"
              aria-expanded={open}
              aria-controls={moreId}
              aria-label={`${open ? 'Less' : 'More'} about ${sub.name}`}
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            >
              {open ? 'Less' : 'More'}
            </button>
            <div id={moreId} className="sub-more" hidden={!open}>
              {open && sub.desc && <p className="sub-desc">{sub.desc}</p>}
              {open && sub.detail && (
                <div className="sub-detail"><GameDetail sections={sub.detail} /></div>
              )}
            </div>
          </>
        )}
      </div>
      <div className="sub-links">
        {sub.rules && (
          <Link
            className="sub-link"
            to={rulebookPath(parent, sub.slug)}
            state={FROM_LIST}
            aria-label={`${sub.name} rules`}
            title="Rules"
            onClick={(e) => e.stopPropagation()}
          >
            <AiRulesIcon size={14} />
          </Link>
        )}
        <ExternalLink
          className="sub-link sub-yt"
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
