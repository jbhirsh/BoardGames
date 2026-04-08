import { useState } from 'react';
import { Link } from 'react-router';
import { GAMES } from '../data/games';

const SCIENCE_ICONS: Record<string, string> = {
  tablets: '/images/science-tablet.png',
  compasses: '/images/science-compass.png',
  gears: '/images/science-gear.png',
};

interface PlayerScores {
  name: string;
  military: number;
  coins: number;
  wonder: number;
  civilian: number;
  tablets: number;
  compasses: number;
  gears: number;
  commercial: number;
  guilds: number;
}

function emptyScores(name: string): PlayerScores {
  return { name, military: 0, coins: 0, wonder: 0, civilian: 0, tablets: 0, compasses: 0, gears: 0, commercial: 0, guilds: 0 };
}

function calcScience(t: number, c: number, g: number): number {
  return t * t + c * c + g * g + 7 * Math.min(t, c, g);
}

function calcTotal(p: PlayerScores): number {
  return p.military + Math.floor(p.coins / 3) + p.wonder + p.civilian + calcScience(p.tablets, p.compasses, p.gears) + p.commercial + p.guilds;
}

const CATEGORIES = [
  { key: 'military', label: 'Military', color: '#d44', icon: '🛡' },
  { key: 'coins', label: 'Treasury (coins)', color: '#c90', icon: '🪙' },
  { key: 'wonder', label: 'Wonder Stages', color: '#a87b4f', icon: '🏛' },
  { key: 'civilian', label: 'Civilian (Blue)', color: '#3b82f6', icon: '🔵' },
  { key: 'commercial', label: 'Commercial (Yellow)', color: '#ca8a04', icon: '🟡' },
  { key: 'guilds', label: 'Guilds (Purple)', color: '#8b5cf6', icon: '🟣' },
] as const;

type ScoreField = keyof Omit<PlayerScores, 'name'>;

export default function ScoreCalculatorPage() {
  const game = GAMES.find(g => g.slug === '7-wonders');
  const [players, setPlayers] = useState<PlayerScores[]>([
    emptyScores('Player 1'),
    emptyScores('Player 2'),
  ]);
  const [activePlayer, setActivePlayer] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  if (!game) return null;

  const current = players[activePlayer];

  function updateField(field: ScoreField, value: number) {
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
    setPlayers(prev => prev.filter((_, i) => i !== idx));
    setActivePlayer(a => a >= idx && a > 0 ? a - 1 : a);
  }

  function parseNum(val: string, allowNeg = false): number {
    const n = parseInt(val, 10);
    if (isNaN(n)) return 0;
    return allowNeg ? n : Math.max(0, n);
  }

  const scienceVP = calcScience(current.tablets, current.compasses, current.gears);
  const treasuryVP = Math.floor(current.coins / 3);
  const totalVP = calcTotal(current);

  const ranked = [...players]
    .map((p, i) => ({ ...p, total: calcTotal(p), idx: i }))
    .sort((a, b) => b.total - a.total || b.coins - a.coins);

  return (
    <div className="rules-page">
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
          <button
            key={i}
            className={`sc-player-tab${i === activePlayer ? ' active' : ''}`}
            onClick={() => { setActivePlayer(i); setShowSummary(false); }}
          >
            {p.name}
            {players.length > 2 && (
              <span
                className="sc-player-remove"
                onClick={(e) => { e.stopPropagation(); removePlayer(i); }}
              >
                &times;
              </span>
            )}
          </button>
        ))}
        {players.length < 7 && (
          <button className="sc-player-tab sc-add-player" onClick={addPlayer}>+</button>
        )}
        <button
          className={`sc-player-tab sc-summary-tab${showSummary ? ' active' : ''}`}
          onClick={() => setShowSummary(true)}
        >
          Results
        </button>
      </div>

      {showSummary ? (
        <div className="sc-panel">
          <div className="sc-summary">
            {ranked.map((p, rank) => (
              <div key={p.idx} className={`sc-summary-row${rank === 0 ? ' sc-winner' : ''}`}>
                <span className="sc-rank">{rank === 0 ? '👑' : `#${rank + 1}`}</span>
                <span className="sc-summary-name">{p.name}</span>
                <span className="sc-summary-total">{p.total} VP</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="sc-panel">
          <div className="sc-form">
            <div className="sc-name-row">
              <label className="sc-label">Player Name</label>
              <input
                className="sc-input sc-name-input"
                type="text"
                value={current.name}
                onChange={(e) => updateName(e.target.value)}
              />
            </div>

            {CATEGORIES.map(({ key, label, color, icon }) => (
              <div key={key} className="sc-row">
                <label className="sc-label">
                  <span className="sc-icon">{icon}</span>
                  <span>{label}</span>
                  {key === 'coins' && current.coins > 0 && (
                    <span className="sc-vp-note">= {treasuryVP} VP</span>
                  )}
                </label>
                <input
                  className="sc-input"
                  type="number"
                  value={current[key as ScoreField]}
                  onChange={(e) => updateField(key as ScoreField, parseNum(e.target.value, key === 'military'))}
                  style={{ borderColor: color }}
                />
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
                  <div key={field} className="sc-science-field">
                    <span className="sc-science-label"><img src={SCIENCE_ICONS[field]} alt={field} className="sc-science-icon" /></span>
                    <input
                      className="sc-input"
                      type="number"
                      min="0"
                      value={current[field]}
                      onChange={(e) => updateField(field, parseNum(e.target.value))}
                      style={{ borderColor: '#22c55e' }}
                    />
                  </div>
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
    </div>
  );
}
