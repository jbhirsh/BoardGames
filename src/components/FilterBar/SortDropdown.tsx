import { useFilter } from '../../context/useFilter';
import { CheckIcon } from '../Icons';
import Dropdown from './Dropdown';
import type { SortMode } from '../../data/types';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'group', label: 'Group by Type' },
  { value: 'az', label: 'A\u2192Z' },
  { value: 'quick', label: 'Quickest First' },
  { value: 'long', label: 'Longest First' },
];

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

export default function SortDropdown({ isOpen, onToggle }: Props) {
  const { state, dispatch } = useFilter();
  const currentLabel = SORT_OPTIONS.find((o) => o.value === state.baseSort)?.label ?? 'Sort';

  return (
    <Dropdown
      id="sort"
      label={currentLabel}
      isActive={false}
      isOpen={isOpen}
      onToggle={onToggle}
      onClear={(e) => e.stopPropagation()}
    >
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`dd-opt${state.baseSort === opt.value ? ' sel' : ''}`}
          onClick={() => {
            dispatch({ type: 'SET_SORT', payload: opt.value });
            onToggle();
          }}
        >
          <span className="dd-chk">
            {state.baseSort === opt.value && <CheckIcon />}
          </span>
          {opt.label}
        </button>
      ))}
    </Dropdown>
  );
}
