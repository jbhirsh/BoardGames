import { useFilterDispatch, useFilterLayout } from '../context/useFilter';
import { GridIcon, ListIcon } from './Icons';

/**
 * A phone's rows-or-cards switch: one quiet icon button at the end of the
 * heading's line, showing the view it switches to and named for it ("Show
 * as cards", "Show as rows"). A wider screen has the two-button ViewToggle.
 */
export default function ViewFlip() {
  const { view } = useFilterLayout();
  const dispatch = useFilterDispatch();
  const toCards = view !== 'grid';
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={toCards ? 'Show as cards' : 'Show as rows'}
      title={toCards ? 'Show as cards' : 'Show as rows'}
      onClick={() => dispatch({ type: 'SET_VIEW', payload: toCards ? 'grid' : 'list' })}
    >
      {toCards ? <GridIcon /> : <ListIcon />}
    </button>
  );
}
