import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { GAMES } from '../data/games';
import { SCORE_CALCULATORS } from '../data/scoreCalculators';
import NotFoundPage from './NotFoundPage';

let nextPlayerId = 0;

const SCIENCE_ICONS: Record<string, string> = {
  tablets: '/images/science-tablet.png',
  compasses: '/images/science-compass.png',
  gears: '/images/science-gear.png',
};

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

function calcScience(t: number, c: number, g: number): number {
  return t * t + c * c + g * g + 7 * Math.min(t, c, g);
}

function calcTotal(p: PlayerScores): number {
  return num(p.military) + Math.floor(num(p.coins) / 3) + num(p.wonder) + num(p.civilian)
    + calcScience(num(p.tablets), num(p.compasses), num(p.gears)) + num(p.commercial) + num(p.guilds);
}

const CATEGORIES = [
  { key: 'military', label: 'Military', color: '#d44', icon: '🛡' },
  { key: 'coins', label: 'Treasury (coins)', color: '#c90', icon: '🪙' },
  { key: 'wonder', label: 'Wonder Stages', color: '#a87b4f', icon: '🏛' },
  { key: 'civilian', label: 'Civilian (Blue)', color: '#3b82f6', icon: '🔵' },
  { key: 'commercial', label: 'Commercial (Yellow)', color: '#ca8a04', icon: '🟡' },
  { key: 'guilds', label: 'Guilds (Purple)', color: '#8b5cf6', icon: '🟣' },
] as const;

export default function ScoreCalculatorPage() {
  const { slug } = useParams<{ slug: string }>();
  const game = GAMES.find(g => g.slug === slug && SCORE_CALCULATORS.has(g.slug));
  const [initial] = useState(loadGame);
  const [players, setPlayers] = useState<PlayerScores[]>(initial.players);
  const [activePlayer, setActivePlayer] = useState(initial.active);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    saveGame({ players, active: activePlayer });
  }, [players, activePlayer]);

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

  // Phone number pads don't always have a minus key, so military gets a sign toggle.
  function flipMilitarySign() {
    updateField('military', String(-num(current.military)));
  }

  const scienceVP = calcScience(num(current.tablets), num(current.compasses), num(current.gears));
  const treasuryVP = Math.floor(num(current.coins) / 3);
  const totalVP = calcTotal(current);

  const ranked = [...players]
    .map((p, i) => ({ ...p, total: calcTotal(p), idx: i }))
    .sort((a, b) => b.total - a.total || num(b.coins) - num(a.coins));

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

      <div className="sc-player-tabs">
        {players.map((p, i) => (
          <div key={p.id} className={`sc-player-tab-wrap${i === activePlayer && !showSummary ? ' active' : ''}`}>
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
        <div className="sc-panel">
          <div className="sc-summary">
            {ranked.map((p, rank) => (
              <div key={p.id} className={`sc-summary-row${rank === 0 ? ' sc-winner' : ''}`}>
                <span className="sc-rank">{rank === 0 ? '👑' : `#${rank + 1}`}</span>
                <span className="sc-summary-name">{p.name}</span>
                <span className="sc-summary-total">{p.total} VP</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="sc-panel" key={current.id}>
          <div className="sc-form">
            <div className="sc-name-row">
              <label className="sc-label" htmlFor="sc-player-name">Player Name</label>
              <input
                id="sc-player-name"
                className="sc-input sc-name-input"
                type="text"
                value={current.name}
                onChange={(e) => updateName(e.target.value)}
              />
            </div>

            {CATEGORIES.map(({ key, label, color, icon }) => (
              <div key={key} className="sc-row">
                <label className="sc-label" htmlFor={`sc-${key}`}>
                  <span className="sc-icon">{icon}</span>
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
              <label className="sc-label">
                <span className="sc-icon">🟢</span>
                <span>Science (Green)</span>
                <span className="sc-vp-note">= {scienceVP} VP</span>
              </label>
              <div className="sc-science-inputs">
                {(['tablets', 'compasses', 'gears'] as const).map((field) => (
                  <label key={field} className="sc-science-field">
                    <span className="sc-science-label"><img src={SCIENCE_ICONS[field]} alt={field} className="sc-science-icon" /></span>
                    <input
                      className="sc-input"
                      type="number"
                      min="0"
                      placeholder="0"
                      aria-label={field}
                      value={current[field]}
                      onChange={(e) => updateField(field, cleanInput(e.target.value, false))}
                      style={{ borderColor: '#22c55e' }}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="sc-total">
              <span>Total</span>
              <span className="sc-total-num">{totalVP} VP</span>
            </div>
          </div>
        </div>
      )}

      <div className="sc-actions">
        <button type="button" className="sc-new-game" onClick={startNewGame}>New game</button>
      </div>
    </div>
  );
}
