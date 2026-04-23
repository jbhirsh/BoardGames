import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useFilter } from '../context/useFilter';
import type { Game } from '../data/types';
import { pickRandom } from '../utils/pickRandom';
import Backdrop from './Backdrop';

const SPIN_MS = 1400;
const TICK_MS = 75;

export default function RandomPicker() {
  const { filteredGames } = useFilter();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [current, setCurrent] = useState<Game | null>(null);
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
    triggerRef.current?.focus();
  }, [stopTicking]);

  const pick = useCallback(() => {
    const pool = filteredGamesRef.current;
    if (pool.length === 0) return;
    stopTicking();
    setOpen(true);
    setSpinning(true);
    setCurrent((prev) => pickRandom(pool, prev ?? undefined));

    const start = Date.now();
    const tick = () => {
      const currentPool = filteredGamesRef.current;
      if (currentPool.length === 0) {
        // pool emptied mid-spin — freeze on last pick rather than throwing
        setSpinning(false);
        tickRef.current = null;
        return;
      }
      setCurrent((prev) => pickRandom(currentPool, prev ?? undefined));
      if (Date.now() - start >= SPIN_MS) {
        setSpinning(false);
        tickRef.current = null;
        return;
      }
      tickRef.current = window.setTimeout(tick, TICK_MS);
    };
    tickRef.current = window.setTimeout(tick, TICK_MS);
  }, [stopTicking]);

  useEffect(() => { return stopTicking; }, [stopTicking]);

  useEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    card?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab' || !card) return;
      const focusables = card.querySelectorAll<HTMLElement>(
        'a[href], area[href], input:not([disabled]), select:not([disabled]), ' +
        'textarea:not([disabled]), button:not([disabled]), ' +
        '[contenteditable]:not([contenteditable="false"]), ' +
        '[tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!card.contains(active) || active === card) {
        // card has tabIndex=-1, not in focusables list — redirect Tab/Shift+Tab to first/last.
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const disabled = filteredGames.length === 0;

  // Stays mounted at top-level so older NVDA+Firefox / VoiceOver combos that ignore late-added live regions still hear the pick.
  const liveMessage =
    open && current && !spinning ? `Tonight, play — ${current.name}` : '';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="pick-btn"
        onClick={pick}
        disabled={disabled}
      >
        Pick for us
      </button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </span>

      {open && current && (
        <div className="pick-modal">
          <Backdrop onClick={close} />
          <div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pick-eyebrow"
            aria-busy={spinning}
            tabIndex={-1}
            className={`pick-card${spinning ? ' spinning' : ''}`}
          >
            <div id="pick-eyebrow" className="pick-eyebrow">
              {spinning ? 'Spinning…' : `Tonight, play — ${current.name}`}
            </div>
            <img src={current.img} alt="" className="pick-img" />
            <div className="pick-name">{current.name}</div>
            <div className="pick-meta">
              <span>{current.players} players</span>
              <span aria-hidden="true">•</span>
              <span>{current.dur}</span>
            </div>
            {!spinning && (
              <div className="pick-actions">
                <button
                  type="button"
                  className="pick-secondary"
                  onClick={pick}
                >
                  Pick again
                </button>
                <button
                  type="button"
                  className="pick-primary"
                  onClick={() => {
                    const slug = current.slug;
                    close();
                    navigate(`/rules/${slug}`);
                  }}
                >
                  View rules
                </button>
              </div>
            )}
            <button
              type="button"
              className="pick-close"
              onClick={close}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
