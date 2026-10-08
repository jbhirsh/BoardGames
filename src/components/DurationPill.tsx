import { DUR_LABELS, DUR_PILL_LABELS } from '../data/keywords';
import type { DurationCategory, TimeBudget } from '../data/types';

interface Props {
  cat: DurationCategory;
  className?: string;
  /** Text to show instead of the bucket name, such as the game's own "60 min". */
  label?: string;
  /** The time budget a click filters to, which the pill's name says. */
  budget?: TimeBudget;
  onClick?: () => void;
}

export default function DurationPill({ cat, className, label, budget, onClick }: Props) {
  const cls = className ? `${className} dur-${cat}` : `dur-pill dur-${cat}`;
  const interactive = typeof onClick === 'function';
  return (
    <span
      className={cls}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onClick!();
            }
          : undefined
      }
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      // The pill filters to the budget its game fits; with the game's own
      // time on it, say so.
      aria-label={interactive && label && budget ? `${label}: show games ${DUR_LABELS[budget].toLowerCase()}` : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onClick!();
              }
            }
          : undefined
      }
    >
      {label ?? DUR_PILL_LABELS[cat]}
    </span>
  );
}
