import { useFilterDispatch, useFilterLayout } from '../context/useFilter';
import { GridIcon, ListIcon } from './Icons';

export default function ViewToggle() {
  const { view } = useFilterLayout();
  const dispatch = useFilterDispatch();

  return (
    <div className="view-btns">
      <button
        type="button"
        className={`view-btn${view === 'grid' ? ' active' : ''}`}
        onClick={() => dispatch({ type: 'SET_VIEW', payload: 'grid' })}
        aria-label="Grid view"
        aria-pressed={view === 'grid'}
      >
        <GridIcon />
      </button>
      <button
        type="button"
        className={`view-btn${view === 'list' ? ' active' : ''}`}
        onClick={() => dispatch({ type: 'SET_VIEW', payload: 'list' })}
        aria-label="List view"
        aria-pressed={view === 'list'}
      >
        <ListIcon />
      </button>
    </div>
  );
}
