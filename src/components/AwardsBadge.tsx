import type { Award } from '../data/types';

interface Props {
  itemName: string;
  awards: Award[];
}

/**
 * Award count for a game. With one or more wins it renders as a
 * native disclosure so the count can be clicked to reveal which awards;
 * with none it is a plain, non-interactive label.
 */
export default function AwardsBadge({ itemName, awards }: Props) {
  const n = awards.length;
  const label = `${n} ${n === 1 ? 'award' : 'awards'}`;

  if (n === 0) {
    return <span className="awards awards--none">{label}</span>;
  }

  return (
    <details className="awards">
      <summary className="awards-toggle" aria-label={`${itemName}: ${label}, show which`}>
        <span className="awards-trophy" aria-hidden="true">🏆</span> {label}
      </summary>
      <ul className="awards-list">
        {awards.map((a) => (
          <li key={`${a.name}-${a.year}`}>{a.name} <span className="awards-year">{a.year}</span></li>
        ))}
      </ul>
    </details>
  );
}
