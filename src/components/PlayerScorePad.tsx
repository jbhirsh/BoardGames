import { useEffect, useRef, useState, type ReactNode } from 'react';
import { safeStorage } from '../client/safeStorage';
import { revealInStrip } from '../client/revealInStrip';
import { ScoreIcon } from './ScoreIcons';
import { tapTargetClass } from './sharedClasses';
import {
  actionsClass,
  formClass,
  labelClass,
  nameInputClass,
  newGameClass,
  nextClass,
  panelClass,
  sheetCellClass,
  sheetClass,
  sheetCornerClass,
  sheetHeadClass,
  sheetPlaceCellClass,
  sheetPlaceHeadClass,
  sheetRowHeadClass,
  sheetTotalCellClass,
  sheetTotalHeadClass,
  sheetWrapClass,
  totalClass,
  winClass,
} from './scorePadClasses';

let nextPlayerId = 0;

// The strip's buttons: a player's tab (their name, and on the chosen one,
// a × removing them), then Add and Results. A phone gives each a 44px tap
// area; the strip gains room for those (it clips what passes its edges,
// scrolling sideways), and the tab's frame stops clipping its corners.
const tabFrameClass =
  'group/tab inline-flex items-stretch overflow-hidden rounded-control border [transition:color_0.15s,background_0.15s,border-color_0.15s] max-sm:overflow-visible';
const tabClass = `cursor-pointer px-4 py-2 text-[13px] font-semibold [transition:color_0.15s,background_0.15s] max-sm:px-3 ${tapTargetClass}`;
const stripButtonClass = `flex-none cursor-pointer rounded-control border px-4 py-2 font-semibold [transition:color_0.15s,background_0.15s,border-color_0.15s] ${tapTargetClass}`;
const quietStripClass = 'border-border bg-bg2 text-text3 hover:bg-bg3 hover:text-text';

// Scrolls the player strip sideways just far enough to show the chosen tab.
function scrollIntoStrip(el: HTMLDivElement | null) {
  if (el?.parentElement) revealInStrip(el.parentElement, el);
}

/** What every pad keeps for a player; each pad adds its own fields. */
export interface PadPlayer {
  id: number;
  name: string;
}

/** A player's own fields: everything but the id and name the pad gives them. */
export type Fields<P extends PadPlayer> = Omit<P, keyof PadPlayer>;

interface SavedGame<P> {
  players: P[];
  active: number;
}

function newPlayer<P extends PadPlayer>(blank: () => Fields<P>, name: string): P {
  return { id: nextPlayerId++, name, ...blank() } as P;
}

function newGame<P extends PadPlayer>(blank: () => Fields<P>): SavedGame<P> {
  return { players: [newPlayer(blank, 'Player 1'), newPlayer(blank, 'Player 2')], active: 0 };
}

/** The saved game, if it's one this pad could have written; a fresh one otherwise. */
function loadGame<P extends PadPlayer>(
  key: string,
  min: number,
  max: number,
  blank: () => Fields<P>,
  valid: (p: Record<string, unknown>) => boolean,
): SavedGame<P> {
  const isPlayer = (p: unknown): p is P => {
    if (typeof p !== 'object' || p === null) return false;
    const r = p as Record<string, unknown>;
    return Number.isSafeInteger(r.id) && (r.id as number) >= 0 && typeof r.name === 'string' && valid(r);
  };
  try {
    const saved: unknown = JSON.parse(safeStorage.get(key) ?? 'null');
    if (typeof saved === 'object' && saved !== null) {
      const { players, active } = saved as Record<string, unknown>;
      if (
        Array.isArray(players) &&
        players.length >= min &&
        players.length <= max &&
        players.every(isPlayer) &&
        new Set(players.map((p) => p.id)).size === players.length
      ) {
        nextPlayerId = Math.max(nextPlayerId, ...players.map((p) => p.id + 1));
        const idx = typeof active === 'number' && active >= 0 && active < players.length ? active : 0;
        return { players, active: idx };
      }
    }
  } catch {
    // Not a saved game's JSON, or none stored: start a fresh game.
  }
  return newGame(blank);
}

interface Props<P extends PadPlayer> {
  /** Where the game in progress is kept, so it survives a reload, a back-swipe or a discarded tab. */
  storageKey: string;
  minPlayers: number;
  maxPlayers: number;
  /** A new player's own fields, all empty. */
  blank: () => Fields<P>;
  /** Whether a saved player's own fields are ones this pad would write. */
  valid: (player: Record<string, unknown>) => boolean;
  hasScores: (player: P) => boolean;
  /** The player's boxes, between their name and their total. */
  form: (player: P, update: (patch: Partial<Fields<P>>) => void) => ReactNode;
  total: (player: P) => number;
  /** What the total counts: "VP", "points". */
  unit: string;
  /** The Results panel's contents. */
  results: (players: P[]) => ReactNode;
  /** What the whole table shares, above the players (the map played, the Kingdom). */
  setup?: ReactNode;
  /** Called when a new game starts, for the pad to reset what `setup` holds. */
  onNewGame?: () => void;
}

/**
 * A score pad scored a player at a time, its phone passed round the table:
 * 7 Wonders, Ticket to Ride, Dominion. The players scroll sideways in one
 * strip, with Add and Results always at its end; each player's form opens
 * at their name, then the pad's boxes (`form`) and their total, then Next,
 * which hands on to the next player and after the last shows Results, the
 * pad's own sheet (ScoreSheet, mostly). New game asks before clearing any
 * score, as removing a player with scores does. The game in progress is
 * kept in localStorage (safeStorage, so private mode just doesn't
 * remember), and a saved game only loads if it's one this pad could have
 * written.
 */
export default function PlayerScorePad<P extends PadPlayer>({
  storageKey,
  minPlayers,
  maxPlayers,
  blank,
  valid,
  hasScores,
  form,
  total,
  unit,
  results,
  setup,
  onNewGame,
}: Props<P>) {
  const [initial] = useState(() => loadGame(storageKey, minPlayers, maxPlayers, blank, valid));
  const [players, setPlayers] = useState<P[]>(initial.players);
  const [activePlayer, setActivePlayer] = useState(initial.active);
  const [showSummary, setShowSummary] = useState(false);
  // Set when Next hands the phone on, so the next player's form starts at
  // their name rather than wherever the last player left off.
  const handedOn = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    safeStorage.set(storageKey, JSON.stringify({ players, active: activePlayer }));
  }, [storageKey, players, activePlayer]);

  useEffect(() => {
    if (!handedOn.current) return;
    handedOn.current = false;
    panelRef.current?.scrollIntoView?.({ block: 'start' });
    (nameRef.current ?? panelRef.current)?.focus({ preventScroll: true });
  }, [activePlayer, showSummary]);

  const current = players[activePlayer];

  function update(patch: Partial<Fields<P>>) {
    setPlayers((prev) => prev.map((p, i) => (i === activePlayer ? { ...p, ...patch } : p)));
  }

  function updateName(name: string) {
    setPlayers((prev) => prev.map((p, i) => (i === activePlayer ? { ...p, name } : p)));
  }

  function addPlayer() {
    if (players.length >= maxPlayers) return;
    setPlayers((prev) => [...prev, newPlayer(blank, `Player ${prev.length + 1}`)]);
    setActivePlayer(players.length);
  }

  function removePlayer(idx: number) {
    if (players.length <= minPlayers) return;
    const p = players[idx];
    if (hasScores(p) && !window.confirm(`Remove ${p.name} and their scores?`)) return;
    setPlayers((prev) => prev.filter((_, i) => i !== idx));
    setActivePlayer((a) => (a >= idx && a > 0 ? a - 1 : a));
  }

  function startNewGame() {
    if (players.some(hasScores) && !window.confirm('Clear every score and start a new game?')) return;
    const fresh = newGame(blank);
    setPlayers(fresh.players);
    setActivePlayer(fresh.active);
    setShowSummary(false);
    onNewGame?.();
  }

  // Passing the phone round the table: on to the next player, and after the
  // last one, the results.
  function handOn() {
    handedOn.current = true;
    if (activePlayer < players.length - 1) setActivePlayer(activePlayer + 1);
    else setShowSummary(true);
  }

  const next = players[activePlayer + 1];

  return (
    <>
      {setup}
      <div className="mb-3 flex items-stretch gap-1">
        <div className="flex min-w-0 flex-1 scrollbar-none gap-1 overflow-x-auto *:flex-none max-sm:-my-1 max-sm:py-1 [&::-webkit-scrollbar]:hidden">
          {players.map((p, i) => {
            const on = i === activePlayer && !showSummary;
            return (
              <div
                key={p.id}
                className={`${tabFrameClass} ${on ? 'border-blue-tint/30 bg-blue-bg' : 'border-border bg-bg2 hover:bg-bg3'}`}
                ref={i === activePlayer ? scrollIntoStrip : undefined}
              >
                <button
                  type="button"
                  className={`${tabClass} ${on ? 'active text-blue' : 'text-text3 hover:text-text'}`}
                  onClick={() => {
                    setActivePlayer(i);
                    setShowSummary(false);
                  }}
                >
                  {p.name}
                </button>
                {players.length > minPlayers && (
                  // Room for more names on a phone: a player is removed from their own tab.
                  <button
                    type="button"
                    className={`cursor-pointer px-2.5 text-[15px] opacity-50 [transition:opacity_0.15s,background_0.15s] hover:bg-bg3 hover:opacity-100 ${tapTargetClass} ${on ? '' : 'max-sm:hidden'}`}
                    aria-label={`Remove ${p.name}`}
                    onClick={() => removePlayer(i)}
                  >
                    &times;
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {players.length < maxPlayers && (
          <button
            type="button"
            className={`${stripButtonClass} ${quietStripClass} text-[16px]`}
            aria-label="Add player"
            onClick={addPlayer}
          >
            +
          </button>
        )}
        <button
          type="button"
          className={`${stripButtonClass} ml-auto text-[13px] ${showSummary ? 'active border-blue-tint/30 bg-blue-bg text-blue' : quietStripClass}`}
          onClick={() => setShowSummary(true)}
        >
          Results
        </button>
      </div>

      {showSummary ? (
        <div className={panelClass} ref={panelRef} tabIndex={-1} role="region" aria-label="Results">
          {results(players)}
        </div>
      ) : (
        <div className={panelClass} key={current.id} ref={panelRef}>
          <div className={formClass}>
            {/* On a phone the name's box spans the form under its label, its
                edges on the rows' edges; a wider screen has it beside. */}
            <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch max-sm:gap-1.5">
              <label className={labelClass} htmlFor="sc-player-name">
                Player Name
              </label>
              <input
                ref={nameRef}
                id="sc-player-name"
                className={`${nameInputClass} text-left max-sm:w-full max-sm:flex-none sm:max-w-50 sm:text-center`}
                type="text"
                value={current.name}
                onChange={(e) => updateName(e.target.value)}
              />
            </div>

            {form(current, update)}

            <div className={totalClass}>
              <span>Total</span>
              <span className="text-[22px] text-blue">
                {total(current)} {unit}
              </span>
            </div>

            <button type="button" className={nextClass} onClick={handOn}>
              {next ? `Next: ${next.name || 'next player'}` : 'See results'} <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>
      )}

      <div className={actionsClass}>
        <button type="button" className={newGameClass} onClick={startNewGame}>
          New game
        </button>
      </div>
    </>
  );
}

/** A row of the Results sheet: its heading cell's contents, then each player's cell. */
interface SheetRow {
  key: string;
  label: ReactNode;
  cells: ReactNode[];
}

interface SheetProps {
  players: readonly PadPlayer[];
  rows: readonly SheetRow[];
  totals: readonly ReactNode[];
  /** Each player's place as shown ("1st"), or "–" before anyone has scored. */
  places: readonly string[];
  /** Who won, crowned and shaded: nobody before anyone has scored. */
  won: readonly boolean[];
}

/**
 * The Results sheet, like a printed score pad: a row per category and a
 * column per player, then Total and Place. The category column stays put
 * while the players scroll sideways on a phone.
 */
export function ScoreSheet({ players, rows, totals, places, won }: SheetProps) {
  const win = (i: number) => (won[i] ? winClass : '');
  return (
    <div className={sheetWrapClass}>
      <table className={sheetClass}>
        <caption className="sr-only">Scores by category</caption>
        <thead>
          <tr>
            <th scope="col" className={sheetCornerClass}>
              <span className="sr-only">Category</span>
            </th>
            {players.map((p, i) => (
              <th key={p.id} scope="col" className={`${sheetHeadClass} ${win(i)}`}>
                {won[i] && <ScoreIcon kind="winner" className="mx-auto mb-0.5 size-7 text-crown" />}
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className={sheetRowHeadClass}>
                {row.label}
              </th>
              {players.map((p, i) => (
                <td key={p.id} className={`${sheetCellClass} ${win(i)}`}>
                  {row.cells[i]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className={sheetTotalHeadClass}>
              Total
            </th>
            {players.map((p, i) => (
              <td key={p.id} className={`${sheetTotalCellClass} ${win(i)}`}>
                {totals[i]}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={sheetPlaceHeadClass}>
              Place
            </th>
            {players.map((p, i) => (
              <td key={p.id} className={`${sheetPlaceCellClass} ${win(i)}`}>
                {places[i]}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
