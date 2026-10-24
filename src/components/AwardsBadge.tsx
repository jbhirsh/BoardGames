import type { Award } from '../data/types';
import Popover from './Popover';
import { detailHeadingClass, detailSectionClass, pillTapClass } from './sharedClasses';

function countLabel(awards: Award[]) {
  const n = awards.length;
  return `${n} ${n === 1 ? 'award' : 'awards'}`;
}

/** The list of wins, one per line with the year; `boxed` in an open card, row or line, side by side where there's room. */
function AwardsList({ awards, boxed = false }: { awards: Award[]; boxed?: boolean }) {
  return (
    <ul
      className={`awards-list flex-col text-[12px] leading-normal text-text2 ${boxed ? 'mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-x-6 gap-y-0.75 rounded-lg border border-border bg-surface px-2.5 py-2' : 'flex gap-0.75'}`}
    >
      {awards.map((a) => (
        <li key={`${a.name}-${a.year}`} className="wrap-anywhere">
          {a.name} <span className="ml-1 text-text3">{a.year}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Awards section of an open card or list row: the wins in full, under a
 * heading. Nothing for an entry with no wins.
 */
export function AwardsSection({ awards }: { awards: Award[] }) {
  if (awards.length === 0) return null;
  return (
    <div className={`${detailSectionClass} row-awards`}>
      <h3 className={detailHeadingClass}>Awards</h3>
      <AwardsList awards={awards} boxed />
    </div>
  );
}

function Trophy({ count }: { count: number }) {
  return (
    <>
      <span className="text-[11px] leading-none" aria-hidden="true">
        🏆
      </span>
      <span className="tabular-nums">{count}</span>
    </>
  );
}

const awardsButtonBaseClass = `inline-flex cursor-pointer items-center gap-1 rounded-[20px] border px-2 py-0.5 [transition:background_0.2s,border-color_0.2s] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${pillTapClass}`;

/** The gold trophy pill, deeper while hovered or open. */
function awardsButtonClass(open: boolean): string {
  return `${awardsButtonBaseClass} ${open ? 'border-gold/65 bg-gold/24' : 'border-gold/40 bg-gold/12 hover:border-gold/65 hover:bg-gold/24'}`;
}

interface Props {
  itemName: string;
  awards: Award[];
}

/**
 * Clickable award count: a gold trophy pill that opens the list of wins
 * (hover on a pointer, tap on touch). Renders nothing for an entry with no
 * wins.
 */
export default function AwardsBadge({ itemName, awards }: Props) {
  if (awards.length === 0) return null;
  const label = countLabel(awards);
  return (
    <Popover
      className="awards inline-flex font-sans text-[11.5px] font-semibold whitespace-nowrap text-award-fg"
      buttonClassName={awardsButtonClass}
      label={`${itemName}: ${label}, show which`}
      title={`${itemName}: ${label}`}
      trigger={<Trophy count={awards.length} />}
    >
      <AwardsList awards={awards} />
    </Popover>
  );
}
