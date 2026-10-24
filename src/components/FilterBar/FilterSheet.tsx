import { pillClass } from './pillClasses';
import { tapTargetClass } from '../sharedClasses';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useFilter } from '../../context/useFilter';
import { useFilteredWishlist } from '../../context/useFilteredWishlist';
import { activeFilters } from '../../utils/relaxFilters';
import type { FilterField } from '../../utils/filterState';
import { filterToSearchParams } from '../../utils/filterUrl';
import { keepSectionInView } from '../../hooks/useKeepSectionInView';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useScrollLock } from '../../hooks/useScrollLock';
import Backdrop from '../Backdrop';
import { DurationOptions, KeywordOptions, PlayersOptions, SortOptions } from './FilterOptions';

// Search has its own box in the bar; the sheet holds, and clears, the rest.
const SHEET_FILTERS: readonly FilterField[] = ['duration', 'players', 'keywords'];

/**
 * The phone's filters: one "Filters" button beside the search, so the sticky
 * bar stays a single row, and a bottom sheet with every choice laid out.
 * Picks apply as they are made; the sheet stays open until Done, which says
 * how many games the choices leave.
 */
export default function FilterSheet() {
  const { state, dispatch, filteredGames } = useFilter();
  const filteredWishlist = useFilteredWishlist();
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  // The filters as they stood when the sheet opened, while it is open.
  const openedWith = useRef<string | null>(null);
  const titleId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useScrollLock(open);
  useDialogFocus(sheetRef, open, close);

  // A list that shrank under the sheet can leave the page scrolled past its
  // end, and the section's own correction can't move a page the lock holds
  // still. Once the lock lets go (its cleanup runs before this effect), put
  // the section's top back under the bar if the filters changed.
  useEffect(() => {
    if (open || openedWith.current === null) return;
    const changed = openedWith.current !== filterToSearchParams(state).toString();
    openedWith.current = null;
    const section = document.getElementById('collection');
    if (changed && section) keepSectionInView(section);
  }, [open, state]);

  // Search has its own box in the bar; the button counts, and Clear all
  // clears, the rest.
  const on = activeFilters(state).filter((f) => f.id !== 'search').length;
  const shown = state.collection === 'want' ? filteredWishlist.length : filteredGames.length;

  function clearFilters() {
    dispatch({ type: 'CLEAR_FILTERS', payload: SHEET_FILTERS });
    // The button goes once nothing is on; keep focus in the sheet.
    doneRef.current?.focus();
  }

  const section = (title: string, body: React.ReactNode) => (
    <section>
      <h3 className="mt-4 mb-2 text-[11px] font-semibold tracking-[1.5px] text-text3 uppercase">{title}</h3>
      {body}
    </section>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${pillClass(on > 0, false)} shrink-0 ${tapTargetClass}`}
        aria-haspopup="dialog"
        onClick={() => {
          openedWith.current = filterToSearchParams(state).toString();
          setOpen(true);
        }}
      >
        {/* The dot is for the eye; the name reads "Filters 2". */}
        Filters
        {on > 0 && (
          <>
            <span aria-hidden="true"> ·</span> {on}
          </>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-1000 flex items-end">
          <Backdrop onClick={close} />
          <div
            ref={sheetRef}
            className="relative flex max-h-[85svh] w-full animate-sheet-up flex-col rounded-t-panel bg-surface shadow-(--shadow-sheet) focus:outline-none"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
          >
            <div className="flex items-center justify-between border-b border-border px-gutter pt-3.5 pb-2.5">
              <h2 id={titleId} className="font-display text-[20px] font-bold text-dark">
                Filters
              </h2>
              <button
                type="button"
                className="size-9 cursor-pointer rounded-[50%] bg-bg2 text-[15px] text-text2"
                aria-label="Close filters"
                onClick={close}
              >
                {'✕'}
              </button>
            </div>
            <div className="overflow-y-auto overscroll-contain px-gutter pb-3">
              {section('Time', <DurationOptions chips />)}
              {section('Players', <PlayersOptions chips />)}
              {section('Keywords', <KeywordOptions chips />)}
              {section('Sort', <SortOptions chips />)}
            </div>
            <div className="flex gap-2.5 border-t border-border px-gutter pt-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))]">
              {on > 0 && (
                <button
                  type="button"
                  className="h-11 cursor-pointer rounded-xl border border-border bg-bg2 px-4 text-[14px] font-semibold text-text"
                  onClick={clearFilters}
                >
                  Clear all
                </button>
              )}
              <button
                ref={doneRef}
                type="button"
                className="h-11 flex-1 cursor-pointer rounded-xl bg-blue-fill text-[14px] font-semibold text-on-fill"
                onClick={close}
              >
                {`Show ${shown} ${shown === 1 ? 'game' : 'games'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
