import { memo } from 'react';
import type { Game } from '../data/types';
import { useFilterDispatch, useItemFilter } from '../context/useFilter';
import { sortedKw } from '../utils/filterGames';
import { difficultyWord } from '../utils/difficulty';
import { fittingSubgames, hasSubgames, subgameTitle } from '../utils/subgames';
import { gameAnchor } from '../utils/heroCovers';
import PhoneLine from './PhoneLine';
import RulesLink from './RulesLink';
import KeywordPill from './KeywordPill';
import GameDetail from './GameDetail';
import SubGameList from './SubGameList';
import { AwardsSection } from './AwardsBadge';
import GameActions from './GameActions';

interface Props {
  game: Game;
  isOpen: boolean;
  /** Called with the game's name, so one callback serves every line. */
  onToggle: (name: string) => void;
}

/**
 * A collection game on a phone's list: Rules on its line, and open, what a
 * desktop table's open row shows (the write-up, the games inside that fit
 * the filters, the awards and the other actions), after its one-line pitch
 * and tags, which the line has no room for. Memoized: a filter change that
 * leaves this game as it was doesn't redraw it.
 */
export default memo(GameLine);

function GameLine({ game, isOpen, onToggle }: Props) {
  const filter = useItemFilter();
  const dispatch = useFilterDispatch();
  const difficulty = difficultyWord(game);
  const hasFitting = game.subgames !== undefined && fittingSubgames(game.subgames, filter).length > 0;
  return (
    <PhoneLine
      id={gameAnchor(game.slug)}
      img={game.img}
      name={game.name}
      headingLevel={3}
      meta={[game.players, game.dur, difficulty].filter(Boolean).join(' · ')}
      action={<RulesLink game={game} className="rules-btn line-action" />}
      isOpen={isOpen}
      onToggle={() => onToggle(game.name)}
    >
      <p className="line-desc">{game.short}</p>
      <div className="card-kw">
        {sortedKw(game.kw).map((kw) => (
          <KeywordPill
            key={kw}
            keyword={kw}
            active={filter.lit.has(kw)}
            onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: kw })}
          />
        ))}
      </div>
      <GameDetail sections={game.detail} />
      {isOpen && hasSubgames(game) && hasFitting && (
        <div className="detail-section row-subgames">
          <h3>{subgameTitle(game.subgames)}</h3>
          <SubGameList game={game} />
        </div>
      )}
      <AwardsSection awards={game.awards} />
      <GameActions game={game} variant="line" />
    </PhoneLine>
  );
}
