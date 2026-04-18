import { KW } from '../data/keywords';
import type { KeywordId } from '../data/types';

interface Props {
  keyword: KeywordId;
  active?: boolean;
  onClick?: () => void;
}

export default function KeywordPill({ keyword, active, onClick }: Props) {
  const interactive = typeof onClick === 'function';
  return (
    <span
      className={`kw-pill${active ? ' lit' : ''}`}
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
      aria-pressed={interactive ? Boolean(active) : undefined}
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
      {KW[keyword]}
    </span>
  );
}
