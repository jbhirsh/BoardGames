import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useFilter } from '../../context/useFilter';
import { useWishlistItems } from '../../context/useWishlistItems';
import { GAMES } from '../../data/games';
import { filterGames, filterWishlist } from '../../utils/filterGames';
import { activeFilters } from '../../utils/relaxFilters';
import { filterToSearchParams } from '../../utils/filterUrl';
import { keepSectionInView } from '../../hooks/useKeepSectionInView';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useScrollLock } from '../../hooks/useScrollLock';
import Backdrop from '../Backdrop';
import { DurationOptions, KeywordOptions, PlayersOptions, SortOptions } from './FilterOptions';

/**
 * The phone's filters: one "Filters" button beside the search, so the sticky
 * bar stays a single row, and a bottom sheet with every choice laid out.
 * Picks apply as they are made; the sheet stays open until Done, which says
 * how many games the choices leave.
 */
export default function FilterSheet() {
  const { state, dispatch } = useFilter();
  const { items: wishlist } = useWishlistItems();
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
  const shown = !open ? 0 : state.collection === 'want'
    ? filterWishlist(wishlist, state).length
    : filterGames(GAMES, state).length;

  function clearFilters() {
    dispatch({ type: 'SET_DURATION', payload: 'all' });
    dispatch({ type: 'SET_PLAYERS', payload: 0 });
    dispatch({ type: 'CLEAR_KEYWORDS' });
    // The button goes once nothing is on; keep focus in the sheet.
    doneRef.current?.focus();
  }

  const section = (title: string, body: React.ReactNode) => (
    <section className="sheet-sec">
      <h3 className="sheet-sec-title">{title}</h3>
      {body}
    </section>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`dd-btn fb-filters${on > 0 ? ' active' : ''}`}
        aria-haspopup="dialog"
        onClick={() => {
          openedWith.current = filterToSearchParams(state).toString();
          setOpen(true);
        }}
      >
        {/* The dot is for the eye; the name reads "Filters 2". */}
        Filters{on > 0 && <><span aria-hidden="true"> ·</span> {on}</>}
      </button>

      {open && (
        <div className="sheet-modal">
          <Backdrop onClick={close} />
          <div
            ref={sheetRef}
            className="filter-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
          >
            <div className="sheet-hd">
              <h2 id={titleId} className="sheet-title">Filters</h2>
              <button type="button" className="sheet-close" aria-label="Close filters" onClick={close}>
                {'✕'}
              </button>
            </div>
            <div className="sheet-body">
              {section('Time', <DurationOptions />)}
              {section('Players', <PlayersOptions />)}
              {section('Keywords', <KeywordOptions />)}
              {section('Sort', <SortOptions />)}
            </div>
            <div className="sheet-ft">
              {on > 0 && (
                <button type="button" className="sheet-clear" onClick={clearFilters}>
                  Clear all
                </button>
              )}
              <button ref={doneRef} type="button" className="sheet-done" onClick={close}>
                {`Show ${shown} ${shown === 1 ? 'game' : 'games'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
