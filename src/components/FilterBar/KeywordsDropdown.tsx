import { useFilter } from '../../context/useFilter';
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

  const modeLabel = state.keywordMode.toUpperCase();
  const label = isActive
    ? `${state.keywords.size} keyword${state.keywords.size > 1 ? 's' : ''} (${modeLabel})`
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
      <div className="kw-mode-toggle">
        <button
          className={`kw-mode-btn${state.keywordMode === 'or' ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'SET_KEYWORD_MODE', payload: 'or' })}
        >
          Any
        </button>
        <button
          className={`kw-mode-btn${state.keywordMode === 'and' ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'SET_KEYWORD_MODE', payload: 'and' })}
        >
          All
        </button>
      </div>
      <div className="dd-opts-scroll">
        {allKw.map(([id, name]) => {
          const sel = state.keywords.has(id);
          return (
            <button
              key={id}
              type="button"
              className={`dd-opt${sel ? ' sel' : ''}`}
              aria-pressed={sel}
              onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: id })}
            >
              <span className="dd-chk">
                {sel && <CheckIcon />}
              </span>
              {name}
              <span className="dd-count">{countForKw(id)}</span>
            </button>
          );
        })}
      </div>
    </Dropdown>
  );
}
