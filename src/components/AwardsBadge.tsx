import type { Award } from '../data/types';
import Popover from './Popover';

function countLabel(awards: Award[]) {
  const n = awards.length;
  return `${n} ${n === 1 ? 'award' : 'awards'}`;
}

/** The list of wins, one per line with the year. */
export function AwardsList({ awards }: { awards: Award[] }) {
  return (
    <ul className="awards-list">
      {awards.map((a) => (
        <li key={`${a.name}-${a.year}`}>{a.name} <span className="awards-year">{a.year}</span></li>
      ))}
    </ul>
  );
}

function Trophy({ count }: { count: number }) {
  return (
    <>
      <span className="awards-trophy" aria-hidden="true">🏆</span>
      <span className="awards-n">{count}</span>
    </>
  );
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
      className="awards"
      buttonClassName="awards-pill awards-toggle"
      label={`${itemName}: ${label}, show which`}
      title={`${itemName}: ${label}`}
      trigger={<Trophy count={awards.length} />}
    >
      <AwardsList awards={awards} />
    </Popover>
  );
}
