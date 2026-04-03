import { useFilter } from '../context/FilterContext';
import { GridIcon, ListIcon } from './Icons';

export default function ViewToggle() {
  const { state, dispatch } = useFilter();

  return (
    <div className="view-btns">
      <button
        className={`view-btn${state.view === 'grid' ? ' active' : ''}`}
        onClick={() => dispatch({ type: 'SET_VIEW', payload: 'grid' })}
        aria-label="Grid view"
      >
        <GridIcon />
      </button>
      <button
        className={`view-btn${state.view === 'list' ? ' active' : ''}`}
        onClick={() => dispatch({ type: 'SET_VIEW', payload: 'list' })}
        aria-label="List view"
      >
        <ListIcon />
      </button>
    </div>
  );
}
