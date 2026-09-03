import type { WishlistAward } from '../data/types';

interface Props {
  itemName: string;
  awards: WishlistAward[];
}

/**
 * Award count for a wishlist item. With one or more wins it renders as a
 * native disclosure so the count can be clicked to reveal which awards;
 * with none it is a plain, non-interactive label.
 */
export default function AwardsBadge({ itemName, awards }: Props) {
  const n = awards.length;
  const label = `${n} ${n === 1 ? 'award' : 'awards'}`;

  if (n === 0) {
    return <span className="wish-awards wish-awards--none">{label}</span>;
  }

  return (
    <details className="wish-awards">
      <summary className="wish-awards-toggle" aria-label={`${itemName}: ${label}, show which`}>
        <span className="wish-trophy" aria-hidden="true">🏆</span> {label}
      </summary>
      <ul className="wish-awards-list">
        {awards.map((a) => (
          <li key={`${a.name}-${a.year}`}>{a.name} <span className="wish-award-year">{a.year}</span></li>
        ))}
      </ul>
    </details>
  );
}
