import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useNavigate } from 'react-router';
import { useFilterResults } from '../context/useFilter';
import type { FilterState, Game } from '../data/types';
import { pickRandom } from '../utils/pickRandom';
import { pickFresh, resolvePick, type Pick } from '../utils/resolvePick';
import { tableFiltered } from '../utils/filterGames';
import { rulebookPath } from '../utils/rulebooks';
import { DUR_LABELS, playersLabel } from '../data/keywords';
import Backdrop from './Backdrop';
import { FROM_LIST } from '../utils/fromList';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useScrollLock } from '../hooks/useScrollLock';
import { DiceIcon } from './Icons';
import { phoneActionClass, pickButtonClass, pickHeaderClass } from './sharedClasses';

const SPIN_MS = 1400;
const TICK_MS = 75;

// Why this pick: the players and time it fits, and how many it was drawn from.
function whyLine(state: FilterState, poolSize: number): string {
  const ofPool = poolSize === 1 ? 'the only match' : `one of ${poolSize} games`;
  if (!tableFiltered(state)) return ofPool[0].toUpperCase() + ofPool.slice(1);
  const fits = [
    state.players > 0 ? playersLabel(state.players) : null,
    state.duration !== 'all' ? DUR_LABELS[state.duration].toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return `Fits ${fits} · ${ofPool}`;
}

/**
 * Pick for us: spins through the games the filters leave and settles on one
 * not offered yet this session, in a dialog that opens its rules. Its button
 * ends the collection's heading line, or, on a phone, sits in the middle of
 * the bar along the bottom (`variant="bar"`, PhoneNav), which keeps it
 * mounted but `hidden` while the wishlist shows, so a pick after the toggle
 * still doesn't repeat itself.
 */
export default function RandomPicker({
  variant = 'header',
  hidden = false,
}: {
  variant?: 'header' | 'bar';
  hidden?: boolean;
}) {
  const { state, filteredGames } = useFilterResults();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [current, setCurrent] = useState<Game | null>(null);
  // The settled pick, with the game inside it to play when that's what fits,
  // and why it fits, fixed when it settles so a later filter change can't
  // rewrite the reason.
  const [result, setResult] = useState<(Pick & { why: string }) | null>(null);
  // Games already offered this session, so Pick again doesn't repeat itself.
  const seenRef = useRef(new Set<Game>());
  const lastRef = useRef<Game | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const tickRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Written during render so the tick always reads the current filtered list without a stale-ref window.
  const filteredGamesRef = useRef(filteredGames);
  filteredGamesRef.current = filteredGames;

  const stopTicking = useCallback(() => {
    if (tickRef.current !== null) {
      clearTimeout(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    stopTicking();
    setOpen(false);
    setSpinning(false);
    setCurrent(null);
    setResult(null);
    triggerRef.current?.focus();
  }, [stopTicking]);

  const pick = useCallback(() => {
    const pool = filteredGamesRef.current;
    const startState = stateRef.current;
    if (pool.length === 0) return;
    stopTicking();
    setOpen(true);
    setSpinning(true);
    setResult(null);
    setCurrent((prev) => pickRandom(pool, prev ?? undefined, Math.random));

    // Settle on a game not offered yet this session. When the list has all
    // come up, start over, but not with the game just shown.
    const settle = (from: readonly Game[], filters: FilterState) => {
      const seen = seenRef.current;
      if (from.every((g) => seen.has(g))) {
        seen.clear();
        if (lastRef.current && from.length > 1) seen.add(lastRef.current);
      }
      const game = pickFresh(from, seen);
      lastRef.current = game;
      seen.add(game);
      setCurrent(game);
      setResult({ ...resolvePick(game, filters), why: whyLine(filters, from.length) });
      setSpinning(false);
      tickRef.current = null;
    };

    const start = Date.now();
    const tick = () => {
      const currentPool = filteredGamesRef.current;
      if (currentPool.length === 0) {
        // The filters emptied the list mid-spin: settle on the list it
        // started with, and the filters that list came from.
        settle(pool, startState);
        return;
      }
      setCurrent((prev) => pickRandom(currentPool, prev ?? undefined, Math.random));
      if (Date.now() - start >= SPIN_MS) {
        settle(currentPool, stateRef.current);
        return;
      }
      tickRef.current = window.setTimeout(tick, TICK_MS);
    };
    tickRef.current = window.setTimeout(tick, TICK_MS);
  }, [stopTicking]);

  useEffect(() => {
    return stopTicking;
  }, [stopTicking]);

  useScrollLock(open);
  useDialogFocus(cardRef, open, close);

  const disabled = filteredGames.length === 0;

  // A deck's game is named on its own ("Hearts"); an add-on rides with its game.
  const sub = result?.sub;
  const playName = sub?.kind === 'card-game' ? sub.name : (current?.name ?? '');
  // What the dialog and the live region announce, add-on included.
  const spokenName = sub && sub.kind !== 'card-game' ? `${playName} with the ${sub.name}` : playName;
  const shown = sub ?? current;

  // Stays mounted at top-level so older NVDA+Firefox / VoiceOver combos that ignore late-added live regions still hear the pick.
  const liveMessage = open && current && !spinning ? `Tonight, play — ${spokenName}` : '';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`pick-btn ${pickButtonClass} ${variant === 'bar' ? `phone-action ${phoneActionClass}` : pickHeaderClass}`}
        onClick={pick}
        disabled={disabled}
        hidden={hidden}
        title={disabled ? 'No games match your filters' : undefined}
      >
        {variant === 'bar' && <DiceIcon />}
        Pick for us
      </button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </span>

      {/* On the page itself, out of the phone bar, whose sticky stacking
          and backdrop blur would hold a fixed dialog inside the bar. */}
      {open &&
        current &&
        createPortal(
          <div className="fixed inset-0 z-1000 flex items-center justify-center overflow-y-auto overscroll-contain p-6">
            <Backdrop onClick={close} />
            <div
              ref={cardRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={spinning ? 'pick-eyebrow' : undefined}
              aria-label={spinning ? undefined : `Tonight, play — ${spokenName}`}
              aria-busy={spinning}
              tabIndex={-1}
              className="pick-card relative w-full max-w-95 animate-pick-pop rounded-panel border border-border bg-surface px-7 pt-7 pb-6 text-center shadow-(--shadow-dialog)"
            >
              <div id="pick-eyebrow" className="mb-3 text-[11px] font-semibold tracking-[2px] text-text3 uppercase">
                {spinning ? 'Spinning…' : 'Tonight, play'}
              </div>
              <img
                src={current.img}
                alt=""
                className={`mx-auto mb-3.5 block size-30 rounded-[14px] bg-art-matte object-cover filter-(--art-dim) [transition:transform_0.25s_ease] ${spinning ? 'animate-pick-shake' : ''}`}
              />
              <div className="mb-1.5 font-display text-[24px] font-bold tracking-[-0.3px] text-dark">
                {spinning ? current.name : playName}
              </div>
              {!spinning && sub && (
                <div className="-mt-0.5 mb-2 text-[13px] font-semibold text-blue">
                  {sub.kind === 'card-game' ? `Played with the ${current.name}` : `with the ${sub.name}`}
                </div>
              )}
              <div className="mb-3 flex items-center justify-center gap-2 text-[13px] text-text3">
                <span>{shown!.players === '1' ? '1 player' : `${shown!.players} players`}</span>
                <span aria-hidden="true">•</span>
                <span>{shown!.dur}</span>
              </div>
              {!spinning && shown && result && (
                <>
                  <p className="mx-auto mb-2 max-w-[36ch] text-[13.5px] leading-[1.55] text-text2">{shown.short}</p>
                  <p className="mb-4.5 text-[11.5px] text-text3">{result.why}</p>
                </>
              )}
              {!spinning && (
                <div className="flex justify-center gap-2.5">
                  <button
                    type="button"
                    className="h-9 cursor-pointer rounded-control border border-border px-4 text-[13px] font-semibold text-text [transition:background_0.15s,border-color_0.15s] hover:border-text3"
                    onClick={pick}
                  >
                    Pick again
                  </button>
                  <button
                    type="button"
                    className="h-9 cursor-pointer rounded-control bg-blue-fill px-4 text-[13px] font-semibold text-on-fill [transition:background_0.15s,border-color_0.15s] hover:bg-blue-fill-hover"
                    onClick={() => {
                      const to = rulebookPath(current.slug, sub?.rules ? sub.slug : undefined);
                      // Closed at once, before leaving: the scroll lock's
                      // cleanup puts the list back at its offset, and the
                      // router saves that offset for Back as the navigation
                      // starts. Still pinned, the page would read as 0.
                      flushSync(close);
                      navigate(to, { state: FROM_LIST });
                    }}
                  >
                    View rules
                  </button>
                </div>
              )}
              <button
                type="button"
                className="absolute top-2.5 right-2.5 size-7 cursor-pointer rounded-[50%] text-[14px] text-text3 [transition:background_0.15s,color_0.15s] hover:bg-bg2 hover:text-text"
                onClick={close}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
