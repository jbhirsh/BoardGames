import { useFilter } from '../context/useFilter';
import type { CollectionMode } from '../data/types';

/** Own / Want segmented control. The filter bar applies to whichever is selected. */
export default function CollectionToggle() {
  const { state, dispatch } = useFilter();
  const mode = state.collection;

  function choose(next: CollectionMode) {
    dispatch({ type: 'SET_COLLECTION', payload: next });
    // This control sits inside the section it just hid, which would drop
    // keyboard focus to the body; hand it to the twin control in the section
    // now showing (the one carrying the anchor id) once it has rendered.
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`#collection .coll-btn[data-mode="${next}"]`)?.focus();
    });
  }

  return (
    <div className="coll-toggle" role="group" aria-label="Which games to show">
      <button
        type="button"
        className={`coll-btn${mode === 'own' ? ' active' : ''}`}
        aria-pressed={mode === 'own'}
        data-mode="own"
        onClick={() => choose('own')}
      >
        We own
      </button>
      <button
        type="button"
        className={`coll-btn${mode === 'want' ? ' active' : ''}`}
        aria-pressed={mode === 'want'}
        data-mode="want"
        onClick={() => choose('want')}
      >
        We want
      </button>
    </div>
  );
}
