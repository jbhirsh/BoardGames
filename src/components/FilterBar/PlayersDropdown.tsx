import { useFilter } from '../../context/FilterContext';
import { PLAYER_OPTIONS } from '../../data/keywords';
import { CheckIcon } from '../Icons';
import Dropdown from './Dropdown';

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
      label={isActive ? `${state.players} players` : 'Players'}
      isActive={isActive}
      isOpen={isOpen}
      onToggle={onToggle}
      onClear={(e) => {
        e.stopPropagation();
        dispatch({ type: 'SET_PLAYERS', payload: 0 });
      }}
    >
      {PLAYER_OPTIONS.map((n) => (
        <div
          key={n}
          className={`dd-opt${state.players === n ? ' sel' : ''}`}
          onClick={() => {
            dispatch({ type: 'SET_PLAYERS', payload: state.players === n ? 0 : n });
            onToggle();
          }}
        >
          <span className="dd-chk">
            {state.players === n && <CheckIcon />}
          </span>
          {n}{n === 10 ? '+' : ''} players
        </div>
      ))}
    </Dropdown>
  );
}
