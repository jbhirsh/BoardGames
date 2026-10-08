import { useFilter } from '../../context/useFilter';
import { DUR_LABELS } from '../../data/keywords';
import Dropdown from './Dropdown';
import { DurationOptions } from './FilterOptions';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

export default function DurationDropdown({ isOpen, onToggle }: Props) {
  const { state } = useFilter();

  return (
    <Dropdown
      id="duration"
      label={DUR_LABELS[state.duration]}
      isActive={state.duration !== 'all'}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <DurationOptions onPicked={onToggle} />
    </Dropdown>
  );
}
