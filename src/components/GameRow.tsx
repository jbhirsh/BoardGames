import { Link } from 'react-router';
import type { Game } from '../data/types';
import { ytURL, rulesURL } from '../utils/urls';
import { AwardsList } from './AwardsBadge';
import { TABLE_COLUMNS } from './GamesTableHead';
import TableRowCells, { TableRowExpand } from './TableRowCells';
import { YouTubeIcon, AiRulesIcon, CalculatorIcon, SearchIcon } from './Icons';

interface Props {
  game: Game;
  isOpen: boolean;
  onToggle: () => void;
  showGroupBadge: boolean;
}

export default function GameRow({ game, isOpen, onToggle, showGroupBadge }: Props) {
  return (
    <>
      <tr className={`game-row${isOpen ? ' open' : ''}`} onClick={onToggle}>
        <TableRowCells
          name={game.name}
          players={game.players}
          cat={game.cat}
          dur={game.dur}
          short={game.short}
          kw={game.kw}
          awards={game.awards}
          groupBadge={showGroupBadge ? game.group : undefined}
          isOpen={isOpen}
          onToggle={onToggle}
        />
      </tr>
      <TableRowExpand colSpan={TABLE_COLUMNS} isOpen={isOpen}>
        <div
          className="detail-section"
          dangerouslySetInnerHTML={{ __html: game.detail }}
        />
        {game.awards.length > 0 && (
          <div className="detail-section row-awards">
            <h3>Awards</h3>
            <AwardsList awards={game.awards} />
          </div>
        )}
        <div className="row-expand-foot">
          {game.rules ? (
            <Link
              className="rules-link"
              to={`/rules/${game.slug}`}
              onClick={(e) => e.stopPropagation()}
            >
              <AiRulesIcon /> Rules
            </Link>
          ) : (
            <a
              className="rules-link"
              href={rulesURL(game.name)}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(rulesURL(game.name), '_blank'); }}
            >
              <AiRulesIcon /> Rules
            </a>
          )}
          {game.slug === '7-wonders' && (
            <Link
              className="rules-link"
              to={`/score/${game.slug}`}
              onClick={(e) => e.stopPropagation()}
            >
              <CalculatorIcon /> Score
            </Link>
          )}
          {game.slug === 'bananagrams' && (
            <Link
              className="rules-link"
              to="/word-checker"
              onClick={(e) => e.stopPropagation()}
            >
              <SearchIcon /> Word Checker
            </Link>
          )}
          <a
            className="row-yt"
            href={ytURL(game.yt)}
            aria-label={`Watch ${game.name} tutorial on YouTube`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(ytURL(game.yt), '_blank'); }}
          >
            <YouTubeIcon />
          </a>
        </div>
      </TableRowExpand>
    </>
  );
}
