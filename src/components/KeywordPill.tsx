import { KW } from '../data/keywords';
import type { KeywordId } from '../data/types';

interface Props {
  keyword: KeywordId;
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export default function KeywordPill({ keyword, active, onClick }: Props) {
  return (
    <span
      className={`kw-pill${active ? ' lit' : ''}`}
      onClick={onClick}
    >
      {KW[keyword]}
    </span>
  );
}
