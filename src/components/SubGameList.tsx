import { Link } from 'react-router';
import type { Game } from '../data/types';
import { useFilter } from '../context/useFilter';
import { ytURL } from '../utils/urls';
import { rulebookPath } from '../utils/rulebooks';
import { fittingSubgames, shownKind, subgameNoun } from '../utils/subgames';
import { YouTubeIcon, AiRulesIcon, UserIcon, ClockIcon } from './Icons';
import AwardsBadge from './AwardsBadge';

interface Props {
  game: Game & { subgames: NonNullable<Game['subgames']> };
}

/**
 * The games inside a game (Catan's add-ons, the games a deck plays), each with
 * its own players, time, rules and video. Only the ones that fit the players
 * and time filters are listed.
 */
export default function SubGameList({ game }: Props) {
  const { state } = useFilter();
  return (
    <ul className="sub-list" aria-label={`${game.name} ${subgameNoun(game.subgames, 2)}`}>
      {fittingSubgames(game.subgames, state).map((sub) => {
        const kind = shownKind(sub.name, sub.kind);
        return (
        <li key={sub.slug} className="sub-row">
          <div className="sub-main">
            <span className="sub-name">
              {sub.name}
              {kind && <span className={`kind-chip kind-${kind}`}>{kind}</span>}
            </span>
            <span className="sub-meta">
              <span className="cmeta"><UserIcon /> {sub.players}</span>
              <span className="cmeta"><ClockIcon /> {sub.dur}</span>
              <AwardsBadge itemName={sub.name} awards={sub.awards ?? []} />
            </span>
            <p className="sub-short">{sub.short}</p>
          </div>
          <div className="sub-links">
            {sub.rules && (
              <Link
                className="sub-link"
                to={rulebookPath(game.slug, sub.slug)}
                aria-label={`${sub.name} rules`}
                title="Rules"
                onClick={(e) => e.stopPropagation()}
              >
                <AiRulesIcon size={14} />
              </Link>
            )}
            <a
              className="sub-link"
              href={ytURL(sub.yt)}
              aria-label={`Watch ${sub.name} tutorial on YouTube`}
              title="Watch Tutorial"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(ytURL(sub.yt), '_blank'); }}
            >
              <YouTubeIcon />
            </a>
          </div>
        </li>
        );
      })}
    </ul>
  );
}
