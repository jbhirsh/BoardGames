import { useCallback, useEffect, useRef, useState } from 'react';
import { askWorker, waitsForSave, type Controller, type SaveState } from '../pdfjs/saved';

/** How long the service worker is given to answer before it counts as one that never will (an older one). */
export const NO_REPLY_MS = 1500;
/** How often a save under way is asked after again, in case the worker saving it was stopped. */
export const RECHECK_MS = 10_000;

/** What the rules page shows of a rulebook's place on this device. */
export interface OfflineSave {
  /** What its Save for offline item says, or null for no item. */
  state: SaveState | null;
  /**
   * Whether the item holds its place unseen: until the saved check answers
   * (so a saved rulebook never says Save for offline first) and, in the
   * production build, while the service worker installed on a first visit
   * hasn't taken charge yet, so the row never moves when it appears.
   */
  hidden: boolean;
  /** Has the service worker save the rulebook, the reader's files with it. */
  save: () => void;
}

/** The service worker in charge of the page, followed as one takes charge (clients.claim() on a first visit). */
function useController(): Controller | null {
  const sw = navigator.serviceWorker as ServiceWorkerContainer | undefined;
  const [controller, setController] = useState<Controller | null>(() => sw?.controller ?? null);
  useEffect(() => {
    if (!sw) return;
    const change = () => setController(sw.controller);
    sw.addEventListener('controllerchange', change);
    return () => sw.removeEventListener('controllerchange', change);
  }, [sw]);
  return controller;
}

/**
 * Where the rulebook on screen stands on this device, for its Save for
 * offline item, and `save`. The item shows from the page's first paint
 * whenever a service worker is in charge and the browser is online (or the
 * rulebook is saved), starting from what the build's size says: Save for
 * offline for one that waits for it (waitsForSave), Saving… for a small
 * one, which saves itself on opening. Then the page's own saved check
 * (`saved`, savedCopy) or the service worker's answer puts it right. The
 * page asks the worker to save a small one (it joins the save opening it
 * began, if any) and only asks after a large one. A worker that answers
 * nothing within NO_REPLY_MS (an older one, which knows no such message)
 * leaves no item. While saving, it asks again every RECHECK_MS and when
 * the page comes back into view: a worker stopped mid-save (iOS suspends
 * them, browsers cap how long one runs) never says how it ended, but the
 * one started for the question answers saved or unsaved.
 */
export function useOfflineSave(pdf: string, saved: boolean | 'asking', online: boolean): OfflineSave {
  const worker = useController();
  // What the service worker said of each rulebook: an answer to a tab left
  // meanwhile is its, not the one on screen's.
  const [heard, setHeard] = useState<Readonly<Record<string, SaveState>>>({});
  // A worker that didn't answer in time.
  const [silent, setSilent] = useState<Controller | null>(null);
  const hear = useCallback((src: string, state: SaveState) => setHeard((h) => ({ ...h, [src]: state })), []);
  const waits = waitsForSave(pdf);

  const ask = worker !== null && saved === false && online;
  useEffect(() => {
    if (!ask) return;
    const timer = setTimeout(() => setSilent(worker), NO_REPLY_MS);
    const stop = askWorker(worker, pdf, !waits, (state) => {
      clearTimeout(timer);
      setSilent((s) => (s === worker ? null : s));
      hear(pdf, state);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [ask, worker, pdf, waits, hear]);

  let state: SaveState | null = null;
  let hidden = false;
  if (saved === true) state = 'saved';
  else if (online && worker !== null) {
    state = heard[pdf] ?? (silent === worker ? null : waits ? 'unsaved' : 'saving');
    hidden = saved === 'asking';
  } else if (online && import.meta.env.PROD && navigator.serviceWorker) {
    // A first visit, the service worker installing: its place kept.
    state = waits ? 'unsaved' : 'saving';
    hidden = true;
  }

  const recheck = worker !== null && state === 'saving' && !hidden;
  useEffect(() => {
    if (!recheck) return;
    let stop = () => {};
    const again = () => {
      stop();
      stop = askWorker(worker, pdf, false, (answer) => hear(pdf, answer));
    };
    const timer = setInterval(again, RECHECK_MS);
    const shown = () => {
      if (document.visibilityState === 'visible') again();
    };
    document.addEventListener('visibilitychange', shown);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', shown);
      stop();
    };
  }, [recheck, worker, pdf, hear]);

  // Asked once a rulebook is first saved by hand: Safari clears a site's
  // storage after weeks unvisited unless it is persistent.
  const persisted = useRef(false);
  const save = useCallback(() => {
    if (worker === null) return;
    if (!persisted.current) {
      persisted.current = true;
      navigator.storage?.persist?.().catch(() => {});
    }
    hear(pdf, 'saving');
    askWorker(worker, pdf, true, (answer) => hear(pdf, answer));
  }, [worker, pdf, hear]);

  return { state, hidden, save };
}
