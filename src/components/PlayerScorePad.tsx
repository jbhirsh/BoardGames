import { useEffect, useRef, useState, type ReactNode } from 'react';
import { safeStorage } from '../client/safeStorage';
import { revealInStrip } from '../client/revealInStrip';
import { ScoreIcon } from './ScoreIcons';

let nextPlayerId = 0;

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
      <div className="sc-player-tabs">
        <div className="sc-player-strip">
          {players.map((p, i) => (
            <div
              key={p.id}
              className={`sc-player-tab-wrap${i === activePlayer && !showSummary ? ' active' : ''}`}
              ref={i === activePlayer ? scrollIntoStrip : undefined}
            >
              <button
                type="button"
                className={`sc-player-tab${i === activePlayer && !showSummary ? ' active' : ''}`}
                onClick={() => {
                  setActivePlayer(i);
                  setShowSummary(false);
                }}
              >
                {p.name}
              </button>
              {players.length > minPlayers && (
                <button
                  type="button"
                  className="sc-player-remove"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => removePlayer(i)}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
        {players.length < maxPlayers && (
          <button type="button" className="sc-add-player" aria-label="Add player" onClick={addPlayer}>
            +
          </button>
        )}
        <button
          type="button"
          className={`sc-summary-tab${showSummary ? ' active' : ''}`}
          onClick={() => setShowSummary(true)}
        >
          Results
        </button>
      </div>

      {showSummary ? (
        <div className="sc-panel" ref={panelRef} tabIndex={-1} role="region" aria-label="Results">
          {results(players)}
        </div>
      ) : (
        <div className="sc-panel" key={current.id} ref={panelRef}>
          <div className="sc-form">
            <div className="sc-name-row">
              <label className="sc-label" htmlFor="sc-player-name">
                Player Name
              </label>
              <input
                ref={nameRef}
                id="sc-player-name"
                className="sc-input sc-name-input"
                type="text"
                value={current.name}
                onChange={(e) => updateName(e.target.value)}
              />
            </div>

            {form(current, update)}

            <div className="sc-total">
              <span>Total</span>
              <span className="sc-total-num">
                {total(current)} {unit}
              </span>
            </div>

            <button type="button" className="sc-next" onClick={handOn}>
              {next ? `Next: ${next.name || 'next player'}` : 'See results'} <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>
      )}

      <div className="sc-actions">
        <button type="button" className="sc-new-game" onClick={startNewGame}>
          New game
        </button>
      </div>
    </>
  );
}

/** A row of the Results sheet: its heading cell's contents, then each player's cell. */
export interface SheetRow {
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
  const win = (i: number) => (won[i] ? 'sc-win' : undefined);
  return (
    <div className="sc-sheet-wrap">
      <table className="sc-sheet">
        <caption className="sr-only">Scores by category</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Category</span>
            </th>
            {players.map((p, i) => (
              <th key={p.id} scope="col" className={win(i)}>
                {won[i] && <ScoreIcon kind="winner" />}
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {players.map((p, i) => (
                <td key={p.id} className={win(i)}>
                  {row.cells[i]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="sc-sheet-total">
            <th scope="row">Total</th>
            {players.map((p, i) => (
              <td key={p.id} className={win(i)}>
                {totals[i]}
              </td>
            ))}
          </tr>
          <tr className="sc-sheet-place">
            <th scope="row">Place</th>
            {players.map((p, i) => (
              <td key={p.id} className={win(i)}>
                {places[i]}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
