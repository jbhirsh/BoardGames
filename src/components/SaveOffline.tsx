import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SaveState } from '../pdfjs/saved';
import { SavedIcon, SaveOfflineIcon, SavingIcon, WarningIcon } from './Icons';
import { rulesLinkClass } from './sharedClasses';

/** What the live region says as a save ends. */
const ENDED: Partial<Record<SaveState, string>> = {
  saved: 'Saved on this device.',
  failed: 'The rulebook couldn’t be saved.',
  full: 'Not enough space on this device to save the rulebook.',
};

/**
 * Words that a phone (600px and narrower, where the row's three items keep
 * one line) shows `short`, with `full` read out in their place (the row's
 * fewerWordsClass).
 */
function Said({ full, short }: { full: string; short: string }) {
  return (
    <>
      <span className="rules-more">{full}</span>
      <span className="rules-short" aria-hidden="true">
        {short}
      </span>
    </>
  );
}

/** What each state that isn't a button says, after its icon. */
const STATUS: Partial<Record<SaveState, ReactNode>> = {
  saving: (
    <>
      <SavingIcon />
      Saving…
    </>
  ),
  saved: (
    <>
      <SavedIcon />
      <Said full="Saved on this device" short="Saved" />
    </>
  ),
  full: (
    <>
      <WarningIcon />
      <Said full="Not enough space on this device" short="No space" />
    </>
  ),
};

/**
 * The rulebook's Save for offline item, the third in the links row above
 * the reader, after Download PDF (whose size, `sized`, is what saving
 * costs, so the button is described by it) and Open PDF, styled as they
 * are. A button to save it, or to try again after a failure; otherwise a
 * status: Saving…, Saved on this device, or that there is no room (on a
 * phone, in fewer words: Save offline, Saved, No space, Try again). `hidden`
 * holds its place unseen (useOfflineSave). Focus on the button moves to the
 * status that replaces it (and back, to Try again), and the live region
 * says how a save ended, only as it ends: not for a tab whose rulebook was
 * saved already.
 */
export default function SaveOffline({
  pdf,
  state,
  hidden = false,
  sized,
  onSave,
}: {
  pdf: string;
  state: SaveState;
  hidden?: boolean;
  sized: boolean;
  onSave: () => void;
}) {
  // Saving… shown, not only predicted unseen: a saved rulebook's item can
  // hold its place as Saving… until the saved check says Saved.
  const [last, setLast] = useState({ pdf, state, hidden });
  const [ended, setEnded] = useState<string | null>(null);
  if (last.pdf !== pdf || last.state !== state || last.hidden !== hidden) {
    setLast({ pdf, state, hidden });
    if (last.pdf !== pdf || last.state !== state) {
      setEnded(last.pdf === pdf && last.state === 'saving' && !last.hidden ? (ENDED[state] ?? null) : null);
    }
  }

  const item = useRef<HTMLElement | null>(null);
  // Whether the item has focus, which it loses when a button gives way to
  // a status, or a status to a button: kept on what took its place.
  const focused = useRef(false);
  const button = state === 'unsaved' || state === 'failed';
  useEffect(() => {
    if (focused.current && document.activeElement === document.body) item.current?.focus({ preventScroll: true });
  }, [button]);
  const ref = (node: HTMLElement | null) => {
    item.current = node;
  };

  return (
    <span
      className="inline-flex"
      style={hidden ? { visibility: 'hidden' } : undefined}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
      }}
    >
      {button ? (
        <button
          ref={ref}
          type="button"
          className={`rules-save ${rulesLinkClass} cursor-pointer p-0 [&_svg]:size-3.5 [&_svg]:flex-none`}
          aria-describedby={state === 'unsaved' && sized ? 'rules-download-size' : undefined}
          onClick={onSave}
        >
          <SaveOfflineIcon />
          {/* On a phone, Save offline, named so (a name read out must hold
              the words on screen, and "for" would split them), and Try
              again, with what came before read out still. */}
          {state === 'unsaved' ? (
            <span>
              Save <span className="rules-wide">for</span> offline
            </span>
          ) : (
            <span>
              <span className="rules-more">Couldn’t save.</span> Try again
            </span>
          )}
        </button>
      ) : (
        <span
          ref={ref}
          className={`rules-save rules-save-status rules-save-${state} inline-flex items-center gap-1.5 text-[13px] text-text2 focus:outline-none max-xs:gap-1.25 [&_svg]:size-3.5 [&_svg]:flex-none ${state === 'saved' ? '[&_svg]:text-ok-fg' : ''}`}
          tabIndex={-1}
        >
          {STATUS[state]}
        </span>
      )}
      <span className="sr-only" aria-live="polite">
        {ended}
      </span>
    </span>
  );
}
