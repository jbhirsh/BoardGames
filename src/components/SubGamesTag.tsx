import type { Game } from '../data/types';
import { useFilter } from '../context/useFilter';
import { fittingSubgames, subgameLabel } from '../utils/subgames';
import Popover from './Popover';

interface Props {
  game: Game & { subgames: NonNullable<Game['subgames']> };
}

/**
 * The tag under a list row's description that says a game holds others
 * ("+2 add-ons", "1 of 12 games fit") and lists the names of the ones that
 * fit on hover or tap, the way the award count lists the wins. Nothing when
 * none fit.
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
      trigger={label}
    >
      <ul className="sub-tag-list">
        {fitting.map((s) => <li key={s.slug}>{s.name}</li>)}
      </ul>
    </Popover>
  );
}
