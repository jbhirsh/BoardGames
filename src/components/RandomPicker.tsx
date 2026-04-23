import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useFilter } from '../context/useFilter';
import type { Game } from '../data/types';

const SPIN_MS = 1400;
const TICK_MS = 75;

function pickRandom<T>(pool: readonly T[], exclude?: T): T {
  if (pool.length === 0) throw new Error('pool empty');
  if (pool.length === 1) return pool[0];
  const idx = Math.floor(Math.random() * pool.length);
  const picked = pool[idx];
  if (exclude !== undefined && picked === exclude) {
    return pool[(idx + 1) % pool.length];
  }
  return picked;
}

export default function RandomPicker() {
  const { filteredGames } = useFilter();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [current, setCurrent] = useState<Game | null>(null);
  const tickRef = useRef<number | null>(null);

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
  }, [stopTicking]);

  const pick = useCallback(() => {
    if (filteredGames.length === 0) return;
    stopTicking();
    const initial = pickRandom(filteredGames);
    setOpen(true);
    setSpinning(true);
    setCurrent(initial);

    const start = Date.now();
    const tick = () => {
      setCurrent((prev) => pickRandom(filteredGames, prev ?? undefined));
      if (Date.now() - start >= SPIN_MS) {
        setSpinning(false);
        tickRef.current = null;
        return;
      }
      tickRef.current = window.setTimeout(tick, TICK_MS);
    };
    tickRef.current = window.setTimeout(tick, TICK_MS);
  }, [filteredGames, stopTicking]);

  useEffect(() => stopTicking, [stopTicking]);

  useEffect(() => {
    if (!open) return;
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
        type="button"
        className="pick-btn"
        onClick={pick}
        disabled={disabled}
        aria-label="Pick a random game from the current filter"
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
          <div className={`pick-card${spinning ? ' spinning' : ''}`}>
            <div className="pick-eyebrow">{spinning ? 'Spinning…' : 'Tonight, play'}</div>
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
