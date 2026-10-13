import { Link } from 'react-router';
import type { Game } from '../data/types';
import { ytURL } from '../utils/urls';
import { AwardsList } from './AwardsBadge';
import { COLLECTION_COLUMNS } from './GamesTableHead';
import TableRowCells, { TableRowExpand } from './TableRowCells';
import SubGameList from './SubGameList';
import SubGamesTag from './SubGamesTag';
import RulesLink from './RulesLink';
import ExternalLink from './ExternalLink';
import { FROM_LIST } from '../utils/fromList';
import { fittingSubgames, subgameTitle } from '../utils/subgames';
import { gameAnchor } from '../utils/heroCovers';
import { SCORE_CALCULATORS } from '../data/scoreCalculators';
import { useFilter } from '../context/useFilter';
import { YouTubeIcon, CalculatorIcon, SearchIcon } from './Icons';

interface Props {
  game: Game;
  isOpen: boolean;
  onToggle: () => void;
  showGroupBadge: boolean;
}

export default function GameRow({ game, isOpen, onToggle, showGroupBadge }: Props) {
  const { state } = useFilter();
  const hasFitting = game.subgames !== undefined && fittingSubgames(game.subgames, state).length > 0;
  return (
    <>
      <tr id={gameAnchor(game.slug)} className={`game-row${isOpen ? ' open' : ''}`} onClick={onToggle}>
        <TableRowCells
          name={game.name}
          players={game.players}
          cat={game.cat}
          dur={game.dur}
          mins={game.mins}
          short={game.short}
          kw={game.kw}
          awards={game.awards}
          groupBadge={showGroupBadge ? game.group : undefined}
          subTag={game.subgames && <SubGamesTag game={{ ...game, subgames: game.subgames }} />}
          difficulty={game}
          isOpen={isOpen}
          onToggle={onToggle}
        />
      </tr>
      <TableRowExpand colSpan={COLLECTION_COLUMNS} isOpen={isOpen}>
        <div
          className="detail-section"
          dangerouslySetInnerHTML={{ __html: game.detail }}
        />
        {isOpen && game.subgames && hasFitting && (
          <div className="detail-section row-subgames">
            <h3>{subgameTitle(game.subgames)}</h3>
            <SubGameList game={{ ...game, subgames: game.subgames }} />
          </div>
        )}
        {game.awards.length > 0 && (
          <div className="detail-section row-awards">
            <h3>Awards</h3>
            <AwardsList awards={game.awards} />
          </div>
        )}
        {/* The actions close the panel on the right, Rules filled as on a
            card, then the game's own tools and its video. */}
        <div className="row-expand-foot">
          <RulesLink game={game} className="rules-btn rules-btn--primary" />
          {SCORE_CALCULATORS.has(game.slug) && (
            <Link
              className="rules-btn"
              to={`/score/${game.slug}`}
              state={FROM_LIST}
              onClick={(e) => e.stopPropagation()}
            >
              <CalculatorIcon /> Score
            </Link>
          )}
          {game.slug === 'bananagrams' && (
            <Link
              className="rules-btn"
              to="/word-checker"
              state={FROM_LIST}
              onClick={(e) => e.stopPropagation()}
            >
              <SearchIcon /> Word Checker
            </Link>
          )}
          <ExternalLink
            className="row-yt"
            href={ytURL(game.yt)}
            aria-label={`Watch ${game.name} tutorial on YouTube`}
          >
            <YouTubeIcon />
          </ExternalLink>
        </div>
      </TableRowExpand>
    </>
  );
}
