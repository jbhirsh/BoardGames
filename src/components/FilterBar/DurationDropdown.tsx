import { useFilter } from '../../context/FilterContext';
import { DUR_LABELS } from '../../data/keywords';
import { CheckIcon } from '../Icons';
import Dropdown from './Dropdown';
import type { DurationFilter } from '../../data/types';

const OPTIONS: { value: DurationFilter; label: string }[] = [
  { value: 'all', label: 'Any length' },
  { value: 'quick', label: 'Quick \u2264 15 min' },
  { value: 'medium', label: 'Medium 30\u201360 min' },
  { value: 'long', label: 'Long 60+ min' },
];

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

export default function DurationDropdown({ isOpen, onToggle }: Props) {
  const { state, dispatch } = useFilter();
  const isActive = state.duration !== 'all';

  return (
    <Dropdown
      id="duration"
      label={DUR_LABELS[state.duration]}
      isActive={isActive}
      isOpen={isOpen}
      onToggle={onToggle}
      onClear={(e) => {
        e.stopPropagation();
        dispatch({ type: 'SET_DURATION', payload: 'all' });
      }}
    >
      {OPTIONS.map((opt) => (
        <div
          key={opt.value}
          className={`dd-opt${state.duration === opt.value ? ' sel' : ''}`}
          onClick={() => {
            dispatch({ type: 'SET_DURATION', payload: opt.value });
            onToggle();
          }}
        >
          <span className="dd-chk">
            {state.duration === opt.value && <CheckIcon />}
          </span>
          {opt.label}
        </div>
      ))}
    </Dropdown>
  );
}
