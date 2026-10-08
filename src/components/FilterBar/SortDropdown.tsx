import { useFilter } from '../../context/useFilter';
import Dropdown from './Dropdown';
import { SortOptions } from './FilterOptions';
import { SORT_OPTIONS } from '../../data/keywords';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

export default function SortDropdown({ isOpen, onToggle }: Props) {
  const { state } = useFilter();
  const currentLabel = SORT_OPTIONS.find((o) => o.value === state.baseSort)?.label ?? 'Sort';

  return (
    <Dropdown
      id="sort"
      label={currentLabel}
      isActive={false}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <SortOptions onPicked={onToggle} />
    </Dropdown>
  );
}
