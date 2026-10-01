import type { Game } from '../data/types';
import { useFilter } from '../context/useFilter';
import { fittingSubgames, subgameLabel } from '../utils/subgames';
import Popover from './Popover';

interface Props {
  game: Game & { subgames: NonNullable<Game['subgames']> };
}

/**
 * The tag beside a list row's name that says a game holds others ("+2
 * add-ons", or just "+2" where the name column is narrow) and lists the
 * names of the ones that fit on hover or tap, the way the award count lists
 * the wins. Nothing when none fit.
 */
export default function SubGamesTag({ game }: Props) {
  const { state } = useFilter();
  const fitting = fittingSubgames(game.subgames, state);
  if (fitting.length === 0) return null;
  const label = subgameLabel(game.subgames, state);
  return (
    <Popover
      className="sub-tag-wrap"
      buttonClassName="sub-tag"
      label={`${game.name}: ${label}, show which`}
      title={`${game.name}: ${label}`}
      trigger={(
        <>
          <span className="sub-tag-full">{label}</span>
          <span className="sub-tag-short">+{fitting.length}</span>
        </>
      )}
    >
      <ul className="sub-tag-list">
        {fitting.map((s) => <li key={s.slug}>{s.name}</li>)}
      </ul>
    </Popover>
  );
}
