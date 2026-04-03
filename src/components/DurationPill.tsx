import { DUR_PILL_LABELS } from '../data/keywords';
import type { DurationCategory } from '../data/types';

interface Props {
  cat: DurationCategory;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export default function DurationPill({ cat, className, onClick }: Props) {
  const cls = className ? `${className} dur-${cat}` : `dur-pill dur-${cat}`;
  return (
    <span className={cls} onClick={onClick}>
      {DUR_PILL_LABELS[cat]}
    </span>
  );
}
