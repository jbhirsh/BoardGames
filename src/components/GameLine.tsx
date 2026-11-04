import { memo } from 'react';
import type { Game } from '../data/types';
import { useFilterDispatch, useItemFilter } from '../context/useFilter';
import { sortedKw } from '../utils/filterGames';
import { difficultyWord } from '../utils/difficulty';
import { fittingSubgames, hasSubgames, subgameTitle } from '../utils/subgames';
import { gameAnchor } from '../utils/heroCovers';
import PhoneLine from './PhoneLine';
import LineMeta from './LineMeta';
import KeywordPill from './KeywordPill';
import GameDetail from './GameDetail';
import SubGameList from './SubGameList';
import { AwardsSection } from './AwardsBadge';
import GameActions from './GameActions';
import { detailHeadingClass, detailSectionClass, tagsClass } from './sharedClasses';

interface Props {
  game: Game;
  isOpen: boolean;
  /** Called with the game's name, so one callback serves every line. */
  onToggle: (name: string) => void;
}

/**
 * A collection game on a phone's list: the line itself only names it, and
 * open, it shows what a desktop table's open row does (the write-up, the
 * games inside that fit the filters, the awards, then Rules and the other
 * actions), after its one-line pitch and tags, which the line has no room
 * for. Its players, time and difficulty word are LineMeta's. Rules waits
 * there rather than on the line, where thirty of it in a
 * column read as one repeated word and took the room a name and its
 * players, time and weight need. Memoized: a filter change that leaves this
 * game as it was doesn't redraw it.
 */
export default memo(GameLine);

function GameLine({ game, isOpen, onToggle }: Props) {
  const filter = useItemFilter();
  const dispatch = useFilterDispatch();
  const hasFitting = game.subgames !== undefined && fittingSubgames(game.subgames, filter).length > 0;
  return (
    <PhoneLine
      id={gameAnchor(game.slug)}
      img={game.img}
      name={game.name}
      headingLevel={3}
      meta={<LineMeta players={game.players} dur={game.dur} difficulty={difficultyWord(game)} />}
      isOpen={isOpen}
      onToggle={() => onToggle(game.name)}
    >
      <p className="mb-2.5 text-[14px] leading-[1.55] text-text2">{game.short}</p>
      <div className={`${tagsClass} mb-3.5`}>
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
        <div className={`${detailSectionClass} row-subgames`}>
          <h3 className={detailHeadingClass}>{subgameTitle(game.subgames)}</h3>
          <SubGameList game={game} inRow />
        </div>
      )}
      <AwardsSection awards={game.awards} />
      <GameActions game={game} variant="row" />
    </PhoneLine>
  );
}
