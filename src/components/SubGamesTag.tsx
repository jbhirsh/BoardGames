import type { GameWithSubgames } from '../data/types';
import { useItemFilter } from '../context/useFilter';
import { fittingSubgames, subgameLabel } from '../utils/subgames';
import Popover from './Popover';
import { pillTapClass } from './sharedClasses';

const subTagBaseClass = `sub-tag cursor-pointer rounded-[999px] border bg-blue-bg px-2 py-px font-sans text-[11.5px] leading-normal font-semibold whitespace-nowrap text-blue [transition:background_0.2s,border-color_0.2s] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${pillTapClass}`;
const ringedClass = 'border-blue-tint/45 inset-ring inset-ring-blue-tint/45';

/** The add-ons tag, ringed while hovered or open. */
function subTagClass(open: boolean): string {
  return `${subTagBaseClass} ${open ? ringedClass : 'border-blue-tint/20 hover:border-blue-tint/45 hover:inset-ring hover:inset-ring-blue-tint/45'}`;
}

interface Props {
  game: GameWithSubgames;
}

/**
 * The tag under a list row's description that says a game holds others
 * ("+2 add-ons", "1 of 12 games fit") and lists the names of the ones that
 * fit on hover or tap, the way the award count lists the wins. Nothing when
 * none fit.
 */
export default function SubGamesTag({ game }: Props) {
  const filter = useItemFilter();
  const fitting = fittingSubgames(game.subgames, filter);
  if (fitting.length === 0) return null;
  const label = subgameLabel(game.subgames, filter);
  return (
    <Popover
      className="sub-tag-wrap inline-flex"
      buttonClassName={subTagClass}
      label={`${game.name}: ${label}, show which`}
      title={`${game.name}: ${label}`}
      trigger={label}
    >
      <ul className="flex flex-col gap-0.75 text-[12px] leading-normal text-text2">
        {fitting.map((s) => (
          <li key={s.slug}>{s.name}</li>
        ))}
      </ul>
    </Popover>
  );
}
