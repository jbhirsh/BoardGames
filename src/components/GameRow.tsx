import { memo } from 'react';
import type { Game } from '../data/types';
import { AwardsSection } from './AwardsBadge';
import { COLLECTION_COLUMNS } from './GamesTableHead';
import TableRowCells, { TableRowExpand } from './TableRowCells';
import SubGameList from './SubGameList';
import SubGamesTag from './SubGamesTag';
import GameActions from './GameActions';
import GameDetail from './GameDetail';
import { fittingSubgames, hasSubgames, subgameTitle } from '../utils/subgames';
import { gameAnchor } from '../utils/heroCovers';
import { useItemFilter } from '../context/useFilter';

interface Props {
  game: Game;
  isOpen: boolean;
  /**
   * Called with the game's name, so the list can pass one callback to every
   * row and a row it leaves alone isn't redrawn for a new one.
   */
  onToggle: (name: string) => void;
}

/** Memoized: a filter change that leaves this game as it was doesn't redraw it. */
export default memo(GameRow);

function GameRow({ game, isOpen, onToggle: toggleRow }: Props) {
  const filter = useItemFilter();
  const onToggle = () => toggleRow(game.name);
  const hasFitting = game.subgames !== undefined && fittingSubgames(game.subgames, filter).length > 0;
  return (
    <>
      <tr id={gameAnchor(game.slug)} className={`game-row${isOpen ? ' open' : ''}`} onClick={onToggle}>
        <TableRowCells
          name={game.name}
          players={game.players}
          dur={game.dur}
          mins={game.mins}
          short={game.short}
          kw={game.kw}
          awards={game.awards}
          subTag={hasSubgames(game) && <SubGamesTag game={game} />}
          difficulty={game}
          isOpen={isOpen}
          onToggle={onToggle}
        />
      </tr>
      <TableRowExpand colSpan={COLLECTION_COLUMNS} isOpen={isOpen}>
        <GameDetail sections={game.detail} />
        {isOpen && hasSubgames(game) && hasFitting && (
          <div className="detail-section row-subgames">
            <h3>{subgameTitle(game.subgames)}</h3>
            <SubGameList game={game} />
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
