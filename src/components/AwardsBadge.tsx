import type { Award } from '../data/types';

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

function TrophyLabel({ label }: { label: string }) {
  return (
    <>
      <span className="awards-trophy" aria-hidden="true">🏆</span> {label}
    </>
  );
}

/** Non-interactive award count: a gold trophy pill, or a muted "0 awards". */
export function AwardsCount({ awards }: { awards: Award[] }) {
  if (awards.length === 0) {
    return <span className="awards awards--none">{countLabel(awards)}</span>;
  }
  return (
    <span className="awards awards-pill">
      <TrophyLabel label={countLabel(awards)} />
    </span>
  );
}

interface Props {
  itemName: string;
  awards: Award[];
}

/**
 * Clickable award count. With one or more wins it renders as a native
 * disclosure so the count can be opened to reveal which awards; with none
 * it is the plain, non-interactive label.
 */
export default function AwardsBadge({ itemName, awards }: Props) {
  if (awards.length === 0) return <AwardsCount awards={awards} />;
  const label = countLabel(awards);
  return (
    <details className="awards">
      <summary className="awards-toggle awards-pill" aria-label={`${itemName}: ${label}, show which`}>
        <TrophyLabel label={label} />
      </summary>
      <AwardsList awards={awards} />
    </details>
  );
}
