import { DUR_PILL_LABELS } from '../data/keywords';
import type { DurationCategory } from '../data/types';

interface Props {
  cat: DurationCategory;
  className?: string;
  onClick?: () => void;
}

export default function DurationPill({ cat, className, onClick }: Props) {
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
      {DUR_PILL_LABELS[cat]}
    </span>
  );
}
