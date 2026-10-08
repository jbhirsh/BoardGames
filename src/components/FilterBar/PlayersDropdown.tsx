import { useFilter } from '../../context/useFilter';
import { playersLabel } from '../../data/keywords';
import Dropdown from './Dropdown';
import { PlayersOptions } from './FilterOptions';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

export default function PlayersDropdown({ isOpen, onToggle }: Props) {
  const { state } = useFilter();
  const isActive = state.players > 0;

  return (
    <Dropdown
      id="players"
      label={isActive ? playersLabel(state.players) : 'Players'}
      isActive={isActive}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <PlayersOptions onPicked={onToggle} />
    </Dropdown>
  );
}
