import { useFilter } from '../../context/useFilter';
import { PLAYER_OPTIONS, playersLabel } from '../../data/keywords';
import Dropdown from './Dropdown';
import RadioOptions from './RadioOptions';

const OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Any number' },
  ...PLAYER_OPTIONS.map((n) => ({ value: n, label: n === 10 ? '10+ players' : playersLabel(n) })),
];

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

export default function PlayersDropdown({ isOpen, onToggle }: Props) {
  const { state, dispatch } = useFilter();
  const isActive = state.players > 0;

  return (
    <Dropdown
      id="players"
      label={isActive ? playersLabel(state.players) : 'Players'}
      isActive={isActive}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <RadioOptions
        label="Players"
        options={OPTIONS}
        selected={state.players}
        onSelect={(value) => {
          dispatch({ type: 'SET_PLAYERS', payload: value });
          onToggle();
        }}
      />
    </Dropdown>
  );
}
