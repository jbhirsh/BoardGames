import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { GAMES } from '../data/games';
import { SCORE_CALCULATORS } from '../data/scoreCalculators';
import { breakdown, ordinal, scienceScore, standings, tieBreaks, treasuryScore, type Breakdown, type Tally } from '../utils/sevenWonders';
import NotFoundPage from './NotFoundPage';
import { ScoreIcon, type ScoreIconKind } from './ScoreIcons';

let nextPlayerId = 0;

// Scrolls the player strip sideways just far enough to show the chosen tab.
// scrollIntoView would also scroll the page to bring the strip into view.
function scrollIntoStrip(el: HTMLDivElement | null) {
  const strip = el?.parentElement;
  if (!el || !strip) return;
  const left = el.offsetLeft - strip.offsetLeft;
  const right = left + el.offsetWidth;
  if (left < strip.scrollLeft) strip.scrollLeft = left;
  else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
}

const SCORE_FIELDS = ['military', 'coins', 'wonder', 'civilian', 'tablets', 'compasses', 'gears', 'commercial', 'guilds'] as const;
type ScoreField = typeof SCORE_FIELDS[number];

// Each field keeps the text as typed, so an empty box or a lone "-" survives
// while someone is mid-entry; totals read it through num().
type PlayerScores = { id: number; name: string } & Record<ScoreField, string>;

function emptyScores(name: string): PlayerScores {
  const fields = Object.fromEntries(SCORE_FIELDS.map(f => [f, ''])) as Record<ScoreField, string>;
  return { id: nextPlayerId++, name, ...fields };
}

function num(text: string): number {
  const n = parseInt(text, 10);
  return isNaN(n) ? 0 : n;
}

// Typed text to stored text: drops leading zeros ("07" -> "7"), allows a sign
// only on military, and floors any other field at 0.
// A number input reports a half-typed "-" as "", so that arrives here as
// empty and the browser keeps showing the minus until the digit follows.
function cleanInput(text: string, allowNeg: boolean): string {
  const n = parseInt(text, 10);
  if (isNaN(n)) return '';
  return String(allowNeg ? n : Math.max(0, n));
}

function hasScores(p: PlayerScores): boolean {
  return SCORE_FIELDS.some(f => num(p[f]) !== 0);
}

function tally(p: PlayerScores): Tally {
  return {
    military: num(p.military),
    coins: num(p.coins),
    wonder: num(p.wonder),
    civilian: num(p.civilian),
    commercial: num(p.commercial),
    guilds: num(p.guilds),
    symbols: { tablets: num(p.tablets), compasses: num(p.compasses), gears: num(p.gears) },
  };
}

// The game in progress survives a reload, a back-swipe or a discarded tab.
const STORAGE_KEY = 'gameroom:score:7-wonders';

interface SavedGame { players: PlayerScores[]; active: number }

function newGame(): SavedGame {
  return { players: [emptyScores('Player 1'), emptyScores('Player 2')], active: 0 };
}

function isPlayer(p: unknown): p is PlayerScores {
  if (typeof p !== 'object' || p === null) return false;
  const r = p as Record<string, unknown>;
  return Number.isSafeInteger(r.id) && (r.id as number) >= 0 && typeof r.name === 'string'
    && SCORE_FIELDS.every(f => typeof r[f] === 'string' && /^-?\d*$/.test(r[f] as string));
}

function loadGame(): SavedGame {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof saved === 'object' && saved !== null) {
      const { players, active } = saved as Record<string, unknown>;
      if (Array.isArray(players) && players.length >= 2 && players.length <= 7 && players.every(isPlayer)
        && new Set(players.map(p => p.id)).size === players.length) {
        nextPlayerId = Math.max(nextPlayerId, ...players.map(p => p.id + 1));
        const idx = typeof active === 'number' && active >= 0 && active < players.length ? active : 0;
        return { players, active: idx };
      }
    }
  } catch {
    // Unreadable or unavailable storage: start a fresh game.
  }
  return newGame();
}

function saveGame(game: SavedGame): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  } catch {
    // Storage unavailable (private mode); the game just isn't remembered.
  }
}

const CATEGORIES = [
  { key: 'military', label: 'Military', color: '#d44' },
  { key: 'coins', label: 'Treasury (coins)', color: '#c90' },
  { key: 'wonder', label: 'Wonder Stages', color: '#a87b4f' },
  { key: 'civilian', label: 'Civilian (Blue)', color: '#3b82f6' },
  { key: 'commercial', label: 'Commercial (Yellow)', color: '#ca8a04' },
  { key: 'guilds', label: 'Guilds (Purple)', color: '#8b5cf6' },
] as const;

const SCIENCE_COLOR = '#22c55e';

// The Results sheet's rows, in the printed pad's order.
const SHEET_ROWS: { key: keyof Omit<Breakdown, 'total'>; label: string; icon: ScoreIconKind; color: string }[] = [
  { key: 'military', label: 'Military', icon: 'military', color: '#d44' },
  { key: 'treasury', label: 'Treasury', icon: 'treasury', color: '#c90' },
  { key: 'wonder', label: 'Wonder', icon: 'wonder', color: '#a87b4f' },
  { key: 'civilian', label: 'Civilian', icon: 'civilian', color: '#3b82f6' },
  { key: 'science', label: 'Science', icon: 'science', color: SCIENCE_COLOR },
  { key: 'commercial', label: 'Commercial', icon: 'commercial', color: '#ca8a04' },
  { key: 'guilds', label: 'Guilds', icon: 'guilds', color: '#8b5cf6' },
];

const ICON_FOR: Record<typeof CATEGORIES[number]['key'], ScoreIconKind> = {
  military: 'military',
  coins: 'treasury',
  wonder: 'wonder',
  civilian: 'civilian',
  commercial: 'commercial',
  guilds: 'guilds',
};

export default function ScoreCalculatorPage() {
  const { slug } = useParams<{ slug: string }>();
  const game = GAMES.find(g => g.slug === slug && SCORE_CALCULATORS.has(g.slug));
  const [initial] = useState(loadGame);
  const [players, setPlayers] = useState<PlayerScores[]>(initial.players);
  const [activePlayer, setActivePlayer] = useState(initial.active);
  const [showSummary, setShowSummary] = useState(false);
  // Set when Next hands the phone on, so the next player's form starts at
  // their name rather than wherever the last player left off.
  const handedOn = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveGame({ players, active: activePlayer });
  }, [players, activePlayer]);

  useEffect(() => {
    if (!handedOn.current) return;
    handedOn.current = false;
    panelRef.current?.scrollIntoView?.({ block: 'start' });
    (nameRef.current ?? panelRef.current)?.focus({ preventScroll: true });
  }, [activePlayer, showSummary]);

  if (!game) {
    return <NotFoundPage title="No score calculator" message="There's no score calculator for that game. Pick a game from the collection to see what it has." />;
  }

  const current = players[activePlayer];

  function updateField(field: ScoreField, value: string) {
    setPlayers(prev => prev.map((p, i) => i === activePlayer ? { ...p, [field]: value } : p));
  }

  function updateName(name: string) {
    setPlayers(prev => prev.map((p, i) => i === activePlayer ? { ...p, name } : p));
  }

  function addPlayer() {
    if (players.length >= 7) return;
    setPlayers(prev => [...prev, emptyScores(`Player ${prev.length + 1}`)]);
    setActivePlayer(players.length);
  }

  function removePlayer(idx: number) {
    if (players.length <= 2) return;
    const p = players[idx];
    if (hasScores(p) && !window.confirm(`Remove ${p.name} and their scores?`)) return;
    setPlayers(prev => prev.filter((_, i) => i !== idx));
    setActivePlayer(a => a >= idx && a > 0 ? a - 1 : a);
  }

  function startNewGame() {
    if (players.some(hasScores) && !window.confirm('Clear every score and start a new game?')) return;
    const fresh = newGame();
    setPlayers(fresh.players);
    setActivePlayer(fresh.active);
    setShowSummary(false);
  }

  // Passing the phone round the table: on to the next player, and after the
  // last one, the results.
  function handOn() {
    handedOn.current = true;
    if (activePlayer < players.length - 1) setActivePlayer(activePlayer + 1);
    else setShowSummary(true);
  }

  // Phone number pads don't always have a minus key, so military gets a sign toggle.
  function flipMilitarySign() {
    updateField('military', String(-num(current.military)));
  }

  const currentTally = tally(current);
  const scienceVP = scienceScore(currentTally.symbols);
  const treasuryVP = treasuryScore(currentTally.coins);
  const totalVP = breakdown(currentTally).total;

  const sheet = players.map(p => breakdown(tally(p)));
  const places = standings(players.map((p, i) => ({ total: sheet[i].total, coins: num(p.coins) })));
  const placeOf = new Map(places.map(s => [s.player, s.place]));
  // Before anyone has scored, everyone ties on 0: crown nobody yet.
  const scored = players.some(hasScores);
  const won = (i: number) => scored && placeOf.get(i) === 1;
  const notes = !scored ? [] : tieBreaks(places.map(s => ({
    name: players[s.player].name,
    total: sheet[s.player].total,
    coins: num(players[s.player].coins),
    place: s.place,
  })));
  const next = players[activePlayer + 1];

  return (
    <div className="rules-page">
      <title>{`${game.name} score · The Game Room`}</title>
      <header className="rules-header">
        <Link to="/" className="back-link">&larr; Back to The Game Room</Link>
        <div className="rules-title-row">
          <img src={game.img} alt={`${game.name} box art`} className="rules-box-art" />
          <div className="rules-title-info">
            <h1 className="rules-game-name">Score Calculator</h1>
            <p className="rules-game-desc">{game.name}</p>
          </div>
        </div>
      </header>

      {/* One row, however many play: the players scroll sideways in their
          own strip, with Add and Results always at its end. */}
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
                onClick={() => { setActivePlayer(i); setShowSummary(false); }}
              >
                {p.name}
              </button>
              {players.length > 2 && (
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
        {players.length < 7 && (
          <button type="button" className="sc-add-player" aria-label="Add player" onClick={addPlayer}>+</button>
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
          {/* A score sheet like the printed pad: a row per category, a column
              per player. The category column stays put while the players
              scroll sideways on a phone. */}
          <div className="sc-sheet-wrap">
            <table className="sc-sheet">
              <caption className="sr-only">Scores by category</caption>
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Category</span></th>
                  {players.map((p, i) => (
                    <th key={p.id} scope="col" className={won(i) ? 'sc-win' : undefined}>
                      {won(i) && <ScoreIcon kind="winner" />}
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SHEET_ROWS.map(row => (
                  <tr key={row.key}>
                    <th scope="row">
                      <span className="sc-sheet-label" style={{ color: row.color }}><ScoreIcon kind={row.icon} /></span>
                      {row.label}
                    </th>
                    {players.map((p, i) => (
                      <td key={p.id} className={won(i) ? 'sc-win' : undefined}>
                        {sheet[i][row.key]}
                        {row.key === 'treasury' && num(p.coins) > 0 && (
                          <span className="sc-sheet-sub"><span className="sr-only">, from </span>{num(p.coins)} coins</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="sc-sheet-total">
                  <th scope="row">Total</th>
                  {players.map((p, i) => (
                    <td key={p.id} className={won(i) ? 'sc-win' : undefined}>{sheet[i].total}</td>
                  ))}
                </tr>
                <tr className="sc-sheet-place">
                  <th scope="row">Place</th>
                  {players.map((p, i) => (
                    <td key={p.id} className={won(i) ? 'sc-win' : undefined}>{scored ? ordinal(placeOf.get(i)!) : '–'}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          {notes.map(note => <p key={note} className="sc-tie-note">{note}</p>)}
          <p className="sc-tie-rule">A tie on points goes to the player with more coins.</p>
        </div>
      ) : (
        <div className="sc-panel" key={current.id} ref={panelRef}>
          <div className="sc-form">
            <div className="sc-name-row">
              <label className="sc-label" htmlFor="sc-player-name">Player Name</label>
              <input
                ref={nameRef}
                id="sc-player-name"
                className="sc-input sc-name-input"
                type="text"
                value={current.name}
                onChange={(e) => updateName(e.target.value)}
              />
            </div>

            {CATEGORIES.map(({ key, label, color }) => (
              <div key={key} className="sc-row">
                <label className="sc-label" htmlFor={`sc-${key}`}>
                  <span className="sc-label-icon" style={{ color }}><ScoreIcon kind={ICON_FOR[key]} /></span>
                  <span>{label}</span>
                  {key === 'coins' && num(current.coins) > 0 && (
                    <span className="sc-vp-note">= {treasuryVP} VP</span>
                  )}
                </label>
                <div className="sc-input-wrap">
                  {key === 'military' && (
                    <button
                      type="button"
                      className="sc-sign"
                      aria-label="± Switch military sign"
                      title={num(current.military) === 0 ? 'Type the number first' : undefined}
                      disabled={num(current.military) === 0}
                      onClick={flipMilitarySign}
                    >
                      &plusmn;
                    </button>
                  )}
                  <input
                    id={`sc-${key}`}
                    className="sc-input"
                    type="number"
                    placeholder="0"
                    value={current[key]}
                    onChange={(e) => updateField(key, cleanInput(e.target.value, key === 'military'))}
                    style={{ borderColor: color }}
                  />
                </div>
              </div>
            ))}

            <div className="sc-science-section">
              <div className="sc-label">
                <span className="sc-label-icon" style={{ color: SCIENCE_COLOR }}><ScoreIcon kind="science" /></span>
                <span>Science (Green)</span>
                <span className="sc-vp-note">= {scienceVP} VP</span>
              </div>
              <div className="sc-science-inputs">
                {(['tablets', 'compasses', 'gears'] as const).map((field) => (
                  <label key={field} className="sc-science-field" style={{ color: SCIENCE_COLOR }}>
                    <ScoreIcon kind={field} />
                    <input
                      className="sc-input"
                      type="number"
                      min="0"
                      placeholder="0"
                      aria-label={field}
                      value={current[field]}
                      onChange={(e) => updateField(field, cleanInput(e.target.value, false))}
                      style={{ borderColor: SCIENCE_COLOR }}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="sc-total">
              <span>Total</span>
              <span className="sc-total-num">{totalVP} VP</span>
            </div>

            <button type="button" className="sc-next" onClick={handOn}>
              {next ? `Next: ${next.name || 'next player'}` : 'See results'} <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>
      )}

      <div className="sc-actions">
        <button type="button" className="sc-new-game" onClick={startNewGame}>New game</button>
      </div>
    </div>
  );
}
