import { useFilter } from '../../context/FilterContext';
import { KW } from '../../data/keywords';
import { GAMES } from '../../data/games';
import { CheckIcon } from '../Icons';
import Dropdown from './Dropdown';
import type { KeywordId } from '../../data/types';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

export default function KeywordsDropdown({ isOpen, onToggle }: Props) {
  const { state, dispatch } = useFilter();
  const isActive = state.keywords.size > 0;

  const allKw = Object.entries(KW) as [KeywordId, string][];

  function countForKw(kwId: KeywordId): number {
    return GAMES.filter((g) => g.kw.includes(kwId)).length;
  }

  const label = isActive
    ? `${state.keywords.size} keyword${state.keywords.size > 1 ? 's' : ''} (AND)`
    : 'Keywords';

  return (
    <Dropdown
      id="keywords"
      label={label}
      isActive={isActive}
      isOpen={isOpen}
      onToggle={onToggle}
      onClear={(e) => {
        e.stopPropagation();
        dispatch({ type: 'CLEAR_KEYWORDS' });
      }}
    >
      <div className="dd-opts-scroll">
        {allKw.map(([id, name]) => {
          const sel = state.keywords.has(id);
          return (
            <div
              key={id}
              className={`dd-opt${sel ? ' sel' : ''}`}
              onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: id })}
            >
              <span className="dd-chk">
                {sel && <CheckIcon />}
              </span>
              {name}
              <span className="dd-count">{countForKw(id)}</span>
            </div>
          );
        })}
      </div>
    </Dropdown>
  );
}
