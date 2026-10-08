import { useFilter } from '../../context/useFilter';
import { DUR_LABELS, TIME_BUDGETS } from '../../data/keywords';
import Dropdown from './Dropdown';
import RadioOptions from './RadioOptions';
import type { DurationFilter } from '../../data/types';

// A time budget: each keeps every game that fits in it, quick ones included.
const OPTIONS: { value: DurationFilter; label: string }[] = [
  { value: 'all', label: 'Any length' },
  ...TIME_BUDGETS.map((b) => ({ value: b, label: DUR_LABELS[b] })),
];

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

export default function DurationDropdown({ isOpen, onToggle }: Props) {
  const { state, dispatch } = useFilter();

  return (
    <Dropdown
      id="duration"
      label={DUR_LABELS[state.duration]}
      isActive={state.duration !== 'all'}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <RadioOptions
        label="Time available"
        options={OPTIONS}
        selected={state.duration}
        onSelect={(value) => {
          dispatch({ type: 'SET_DURATION', payload: value });
          onToggle();
        }}
      />
    </Dropdown>
  );
}
