import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useFilter } from '../context/useFilter';
import type { Game } from '../data/types';
import { pickRandom } from '../utils/pickRandom';

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
  const filteredGamesRef = useRef(filteredGames);

  useEffect(() => {
    filteredGamesRef.current = filteredGames;
  }, [filteredGames]);

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
    setCurrent(pickRandom(pool));

    const start = Date.now();
    const tick = () => {
      setCurrent((prev) => pickRandom(filteredGamesRef.current, prev ?? undefined));
      if (Date.now() - start >= SPIN_MS) {
        setSpinning(false);
        tickRef.current = null;
        return;
      }
      tickRef.current = window.setTimeout(tick, TICK_MS);
    };
    tickRef.current = window.setTimeout(tick, TICK_MS);
  }, [stopTicking]);

  useEffect(() => stopTicking, [stopTicking]);

  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const disabled = filteredGames.length === 0;

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

      {open && current && (
        <div className="pick-modal" role="dialog" aria-modal="true" aria-label="Random game pick">
          <button
            type="button"
            className="pick-backdrop"
            onClick={close}
            aria-label="Close"
            tabIndex={-1}
          />
          <div
            ref={cardRef}
            tabIndex={-1}
            className={`pick-card${spinning ? ' spinning' : ''}`}
          >
            <div className="pick-eyebrow" aria-live="polite">
              {spinning ? 'Spinning…' : 'Tonight, play'}
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
