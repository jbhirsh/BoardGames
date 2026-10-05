import { useFilter } from '../context/useFilter';
import { GridIcon, ListIcon } from './Icons';

export default function ViewToggle() {
  const { state, dispatch } = useFilter();

  return (
    <div className="view-btns">
      <button
        type="button"
        className={`view-btn${state.view === 'grid' ? ' active' : ''}`}
        onClick={() => dispatch({ type: 'SET_VIEW', payload: 'grid' })}
        aria-label="Grid view"
        aria-pressed={state.view === 'grid'}
      >
        <GridIcon />
      </button>
      <button
        type="button"
        className={`view-btn${state.view === 'list' ? ' active' : ''}`}
        onClick={() => dispatch({ type: 'SET_VIEW', payload: 'list' })}
        aria-label="List view"
        aria-pressed={state.view === 'list'}
      >
        <ListIcon />
      </button>
    </div>
  );
}
