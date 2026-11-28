import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { PreviewDetails } from '../utils/lookupNotice';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useScrollLock } from '../hooks/useScrollLock';
import Backdrop from './Backdrop';
import PreviewCard from './PreviewCard';
import { adminButtonClass, adminGhostClass, adminMutedClass } from './formClasses';

interface Props {
  /** What was searched for, as the heading names it. */
  name: string;
  /** Every game BoardGameGeek has under the name, newest first. */
  matches: readonly PreviewDetails[];
  /** The BGG id the game has now, marked so the owner can see which card it is. */
  current?: number;
  onPick: (match: PreviewDetails) => void;
  onClose: () => void;
}

/**
 * "Which Container?": one card for each BoardGameGeek game with the name
 * (box art, year, players, time, its one-line summary) and a button to use
 * it, for the edit form's Change match and for the add form and the queue
 * when a name isn't one game. A sheet that rises from the bottom on a phone
 * and a centred dialog from `sm` up, as the app's other dialogs are
 * (RandomPicker), with the same keyboard handling, and focus goes back to
 * what opened it when it closes.
 */
export default function BggMatchSheet({ name, matches, current, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // The latest onClose behind one stable function: useDialogFocus moves focus
  // to the dialog each time its close function changes, which a parent's
  // re-render (an inline onClose) would do while a card button is focused.
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  });
  const close = useCallback(() => closing.current(), []);
  // Before the dialog takes focus, so it is what had it that gets it back.
  useEffect(() => {
    const opener = document.activeElement;
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  useScrollLock(true);
  useDialogFocus(ref, true, close);
  const sorted = [...matches].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.bggId - b.bggId);
  const count = sorted.length === 1 ? 'one game' : `${sorted.length} games`;
  return createPortal(
    <div className="fixed inset-0 z-1000 flex items-end justify-center sm:items-center sm:p-6">
      <Backdrop onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`Which ${name}?`}
        tabIndex={-1}
        className="relative flex max-h-[85dvh] w-full flex-col gap-3 overflow-y-auto overscroll-contain rounded-t-panel border border-border bg-surface p-4 pb-6 shadow-(--shadow-dialog) sm:max-w-120 sm:rounded-panel"
      >
        <div className="flex items-center gap-3">
          <h3 className="mr-auto font-display text-[18px] font-bold text-dark">Which {name}?</h3>
          <button type="button" className={adminGhostClass} onClick={onClose}>
            Close
          </button>
        </div>
        <p className={adminMutedClass}>
          BoardGameGeek has {count} called {name}.
        </p>
        {sorted.map((m) => (
          <div key={m.bggId} className="flex flex-col gap-2">
            <PreviewCard details={m} className="mt-0" />
            <div className="flex items-center gap-2">
              <span className={`${adminMutedClass} mr-auto`}>
                BGG {m.bggId}
                {m.bggId === current ? ' · current' : ''}
              </span>
              <button
                type="button"
                className={adminButtonClass}
                aria-label={`Use ${m.name}${m.year === undefined ? '' : ` (${m.year})`}, BGG ${m.bggId}`}
                onClick={() => onPick(m)}
              >
                Use this one
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
