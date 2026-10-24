import { useFilterDispatch, useFilterLayout } from '../context/useFilter';
import { GridIcon, ListIcon } from './Icons';

const viewButtonBaseClass =
  'flex size-8 cursor-pointer items-center justify-center [transition:background_0.15s,color_0.15s]';

/** Grid or list, the shown one raised in its track (with the `active` hook). */
function viewButtonClass(on: boolean): string {
  return `${viewButtonBaseClass} ${on ? 'active bg-surface text-dark shadow-(--shadow-sm)' : 'text-text3 hover:text-text'}`;
}

export default function ViewToggle() {
  const { view } = useFilterLayout();
  const dispatch = useFilterDispatch();

  return (
    <div className="flex overflow-hidden rounded-control border border-border bg-bg2">
      <button
        type="button"
        className={viewButtonClass(view === 'grid')}
        onClick={() => dispatch({ type: 'SET_VIEW', payload: 'grid' })}
        aria-label="Grid view"
        aria-pressed={view === 'grid'}
      >
        <GridIcon />
      </button>
      <button
        type="button"
        className={viewButtonClass(view === 'list')}
        onClick={() => dispatch({ type: 'SET_VIEW', payload: 'list' })}
        aria-label="List view"
        aria-pressed={view === 'list'}
      >
        <ListIcon />
      </button>
    </div>
  );
}
