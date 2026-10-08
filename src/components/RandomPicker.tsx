import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useFilter } from '../context/useFilter';
import type { FilterState, Game } from '../data/types';
import { pickRandom } from '../utils/pickRandom';
import { pickFresh, resolvePick, type Pick } from '../utils/resolvePick';
import { tableFiltered } from '../utils/filterGames';
import { rulebookPath } from '../utils/rulebooks';
import { DUR_LABELS, playersLabel } from '../data/keywords';
import Backdrop from './Backdrop';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useScrollLock } from '../hooks/useScrollLock';

const SPIN_MS = 1400;
const TICK_MS = 75;

// Why this pick: the players and time it fits, and how many it was drawn from.
function whyLine(state: FilterState, poolSize: number): string {
  const ofPool = poolSize === 1 ? 'the only match' : `one of ${poolSize} games`;
  if (!tableFiltered(state)) return ofPool[0].toUpperCase() + ofPool.slice(1);
  const fits = [
    state.players > 0 ? playersLabel(state.players) : null,
    state.duration !== 'all' ? DUR_LABELS[state.duration].toLowerCase() : null,
  ].filter(Boolean).join(' · ');
  return `Fits ${fits} · ${ofPool}`;
}

export default function RandomPicker() {
  const { state, filteredGames } = useFilter();
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
  // Set when the modal closes because we are navigating away, so the
  // scroll-lock cleanup knows not to restore the old page's offset.
  const navigatingRef = useRef(false);
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
    setCurrent((prev) => pickRandom(pool, prev ?? undefined));

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
      setCurrent((prev) => pickRandom(currentPool, prev ?? undefined));
      if (Date.now() - start >= SPIN_MS) {
        settle(currentPool, stateRef.current);
        return;
      }
      tickRef.current = window.setTimeout(tick, TICK_MS);
    };
    tickRef.current = window.setTimeout(tick, TICK_MS);
  }, [stopTicking]);

  useEffect(() => { return stopTicking; }, [stopTicking]);

  useScrollLock(open, navigatingRef);
  useDialogFocus(cardRef, open, close);

  const disabled = filteredGames.length === 0;

  // A deck's game is named on its own ("Hearts"); an add-on rides with its game.
  const sub = result?.sub;
  const playName = sub?.kind === 'card-game' ? sub.name : current?.name ?? '';
  // What the dialog and the live region announce, add-on included.
  const spokenName = sub && sub.kind !== 'card-game' ? `${playName} with the ${sub.name}` : playName;
  const shown = sub ?? current;

  // Stays mounted at top-level so older NVDA+Firefox / VoiceOver combos that ignore late-added live regions still hear the pick.
  const liveMessage =
    open && current && !spinning ? `Tonight, play — ${spokenName}` : '';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="pick-btn"
        onClick={pick}
        disabled={disabled}
        title={disabled ? 'No games match your filters' : undefined}
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
            aria-labelledby={spinning ? 'pick-eyebrow' : undefined}
            aria-label={spinning ? undefined : `Tonight, play — ${spokenName}`}
            aria-busy={spinning}
            tabIndex={-1}
            className={`pick-card${spinning ? ' spinning' : ''}`}
          >
            <div id="pick-eyebrow" className="pick-eyebrow">
              {spinning ? 'Spinning…' : 'Tonight, play'}
            </div>
            <img src={current.img} alt="" className="pick-img" />
            <div className="pick-name">{spinning ? current.name : playName}</div>
            {!spinning && sub && (
              <div className="pick-with">
                {sub.kind === 'card-game' ? `Played with the ${current.name}` : `with the ${sub.name}`}
              </div>
            )}
            <div className="pick-meta">
              <span>{shown!.players === '1' ? '1 player' : `${shown!.players} players`}</span>
              <span aria-hidden="true">•</span>
              <span>{shown!.dur}</span>
            </div>
            {!spinning && shown && result && (
              <>
                <p className="pick-short">{shown.short}</p>
                <p className="pick-why">{result.why}</p>
              </>
            )}
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
                    const to = rulebookPath(current.slug, sub?.rules ? sub.slug : undefined);
                    navigatingRef.current = true;
                    close();
                    navigate(to);
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
