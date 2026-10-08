import { useFilter } from '../../context/useFilter';
import Dropdown from './Dropdown';
import { KeywordOptions } from './FilterOptions';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

export default function KeywordsDropdown({ isOpen, onToggle }: Props) {
  const { state } = useFilter();
  const isActive = state.keywords.size > 0;
  const label = isActive
    ? `${state.keywords.size} keyword${state.keywords.size > 1 ? 's' : ''} (${state.keywordMode.toUpperCase()})`
    : 'Keywords';

  return (
    <Dropdown
      id="keywords"
      label={label}
      isActive={isActive}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <KeywordOptions />
    </Dropdown>
  );
}
