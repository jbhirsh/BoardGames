import type { Game } from '../data/types';
import { AwardsSection } from './AwardsBadge';
import { COLLECTION_COLUMNS } from './GamesTableHead';
import TableRowCells, { TableRowExpand } from './TableRowCells';
import SubGameList from './SubGameList';
import SubGamesTag from './SubGamesTag';
import GameActions from './GameActions';
import GameDetail from './GameDetail';
import { fittingSubgames, subgameTitle } from '../utils/subgames';
import { gameAnchor } from '../utils/heroCovers';
import { useFilter } from '../context/useFilter';

interface Props {
  game: Game;
  isOpen: boolean;
  onToggle: () => void;
}

export default function GameRow({ game, isOpen, onToggle }: Props) {
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
          subTag={game.subgames && <SubGamesTag game={{ ...game, subgames: game.subgames }} />}
          difficulty={game}
          isOpen={isOpen}
          onToggle={onToggle}
        />
      </tr>
      <TableRowExpand colSpan={COLLECTION_COLUMNS} isOpen={isOpen}>
        <GameDetail sections={game.detail} />
        {isOpen && game.subgames && hasFitting && (
          <div className="detail-section row-subgames">
            <h3>{subgameTitle(game.subgames)}</h3>
            <SubGameList game={{ ...game, subgames: game.subgames }} />
          </div>
        )}
        <AwardsSection awards={game.awards} />
        {/* The actions close the panel on the right, Rules filled as on a
            card, then the game's own tools and its video. */}
        <GameActions game={game} variant="row" />
      </TableRowExpand>
    </>
  );
}
