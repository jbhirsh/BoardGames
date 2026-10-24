import { useFilterDispatch, useFilterLayout } from '../context/useFilter';
import { focusSection } from '../client/focus';
import type { CollectionMode } from '../data/types';

const collectionButtonBaseClass =
  'h-8 cursor-pointer px-2.5 text-[11.5px] font-semibold tracking-[0.2px] [transition:background_0.15s,color_0.15s]';

/** We own or We want, the shown one raised in its track (with the `active` hook). */
function collectionButtonClass(on: boolean): string {
  return `${collectionButtonBaseClass} ${on ? 'active bg-surface text-dark shadow-(--shadow-sm)' : 'text-text3 hover:text-text'}`;
}

/** Own / Want segmented control. The filter bar applies to whichever is selected. */
export default function CollectionToggle() {
  const { collection: mode } = useFilterLayout();
  const dispatch = useFilterDispatch();

  function choose(next: CollectionMode) {
    dispatch({ type: 'SET_COLLECTION', payload: next });
    // This control sits inside the section it just hid, which would drop
    // keyboard focus to the body; hand it to the twin control in the section
    // now showing (the one carrying the anchor id) once it has rendered.
    focusSection(`${next}-toggle`);
  }

  return (
    <div
      className="flex overflow-hidden rounded-lg border border-border bg-bg2"
      role="group"
      aria-label="Which games to show"
    >
      <button
        type="button"
        className={collectionButtonClass(mode === 'own')}
        aria-pressed={mode === 'own'}
        data-focus-target="own-toggle"
        onClick={() => choose('own')}
      >
        We own
      </button>
      <button
        type="button"
        className={collectionButtonClass(mode === 'want')}
        aria-pressed={mode === 'want'}
        data-focus-target="want-toggle"
        onClick={() => choose('want')}
      >
        We want
      </button>
    </div>
  );
}
