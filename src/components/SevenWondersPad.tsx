import {
  breakdown,
  ordinal,
  scienceScore,
  standings,
  tieBreaks,
  treasuryScore,
  type Breakdown,
  type Tally,
} from '../utils/sevenWonders';
import { cleanInput, isBoxText, num } from '../utils/scoreInput';
import PlayerScorePad, { ScoreSheet, type PadPlayer } from './PlayerScorePad';
import ScoreInput, { SignButton } from './ScoreInput';
import { ScoreIcon, type ScoreIconKind } from './ScoreIcons';

const SCORE_FIELDS = [
  'military',
  'coins',
  'wonder',
  'civilian',
  'tablets',
  'compasses',
  'gears',
  'commercial',
  'guilds',
] as const;
type ScoreField = (typeof SCORE_FIELDS)[number];

// Each field keeps the text as typed (utils/scoreInput.ts).
type PlayerScores = PadPlayer & Record<ScoreField, string>;

function blank(): Record<ScoreField, string> {
  return Object.fromEntries(SCORE_FIELDS.map((f) => [f, ''])) as Record<ScoreField, string>;
}

function hasScores(p: PlayerScores): boolean {
  return SCORE_FIELDS.some((f) => num(p[f]) !== 0);
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

// Each category's colour, the same on the form and the Results sheet.
const COLORS: Record<keyof Omit<Breakdown, 'total'>, string> = {
  military: '#d44',
  treasury: '#c90',
  wonder: '#a87b4f',
  civilian: '#3b82f6',
  science: '#22c55e',
  commercial: '#ca8a04',
  guilds: '#8b5cf6',
};

// Each box says what it takes: points as the pad scores them, or the coins
// the page converts. Wonder is the pad's points for the stages built, not
// how many were built.
const CATEGORIES = [
  { key: 'military', label: 'Military', unit: 'VP', color: COLORS.military },
  { key: 'coins', label: 'Treasury', unit: 'coins', color: COLORS.treasury },
  { key: 'wonder', label: 'Wonder', unit: 'VP', color: COLORS.wonder },
  { key: 'civilian', label: 'Civilian (Blue)', unit: 'VP', color: COLORS.civilian },
  { key: 'commercial', label: 'Commercial (Yellow)', unit: 'VP', color: COLORS.commercial },
  { key: 'guilds', label: 'Guilds (Purple)', unit: 'VP', color: COLORS.guilds },
] as const;

// The Results sheet's rows, in the printed pad's order.
const SHEET_ROWS: { key: keyof Omit<Breakdown, 'total'>; label: string; icon: ScoreIconKind }[] = [
  { key: 'military', label: 'Military', icon: 'military' },
  { key: 'treasury', label: 'Treasury', icon: 'treasury' },
  { key: 'wonder', label: 'Wonder', icon: 'wonder' },
  { key: 'civilian', label: 'Civilian', icon: 'civilian' },
  { key: 'science', label: 'Science', icon: 'science' },
  { key: 'commercial', label: 'Commercial', icon: 'commercial' },
  { key: 'guilds', label: 'Guilds', icon: 'guilds' },
];

const ICON_FOR: Record<(typeof CATEGORIES)[number]['key'], ScoreIconKind> = {
  military: 'military',
  coins: 'treasury',
  wonder: 'wonder',
  civilian: 'civilian',
  commercial: 'commercial',
  guilds: 'guilds',
};

function Form({
  player,
  update,
}: {
  player: PlayerScores;
  update: (patch: Partial<Record<ScoreField, string>>) => void;
}) {
  const t = tally(player);
  const scienceVP = scienceScore(t.symbols);
  const treasuryVP = treasuryScore(t.coins);
  return (
    <>
      {CATEGORIES.map(({ key, label, unit, color }) => (
        <div key={key} className="sc-row">
          <label className="sc-label" htmlFor={`sc-${key}`}>
            <span className="sc-label-icon" style={{ color }}>
              <ScoreIcon kind={ICON_FOR[key]} />
            </span>
            <span className="sc-label-text">
              <span>{label}</span>
              {/* Out of the box's name: its description reads it. */}
              {key === 'coins' && (
                <span className="sc-vp-note sc-vp-pts" id="sc-coins-vp" aria-hidden="true">
                  = {treasuryVP} VP
                </span>
              )}
            </span>
          </label>
          <div className="sc-input-wrap">
            {key === 'military' && (
              <SignButton
                label="± Switch military sign"
                value={num(player.military)}
                onFlip={() => update({ military: String(-num(player.military)) })}
              />
            )}
            <ScoreInput
              id={`sc-${key}`}
              unit={unit}
              value={player[key]}
              color={color}
              negative={key === 'military'}
              describedBy={key === 'coins' ? 'sc-coins-vp' : undefined}
              onChange={(e) => update({ [key]: cleanInput(e.target.value, key === 'military') })}
            />
          </div>
        </div>
      ))}

      <div className="sc-science-section">
        <div className="sc-label">
          <span className="sc-label-icon" style={{ color: COLORS.science }}>
            <ScoreIcon kind="science" />
          </span>
          <span className="sc-label-text">
            <span>Science (Green)</span>
            {/* The icons say which symbol; the unit is said once, here. */}
            <span className="sc-vp-note">
              <span id="sc-science-unit">symbols</span>
              <span aria-hidden="true"> · </span>
              <span id="sc-science-vp" className="sc-vp-pts">
                = {scienceVP} VP
              </span>
            </span>
          </span>
        </div>
        <div className="sc-science-inputs">
          {(['tablets', 'compasses', 'gears'] as const).map((field) => (
            <label key={field} className="sc-science-field" htmlFor={`sc-${field}`} style={{ color: COLORS.science }}>
              <ScoreIcon kind={field} />
              <ScoreInput
                id={`sc-${field}`}
                label={field}
                value={player[field]}
                color={COLORS.science}
                describedBy="sc-science-unit sc-science-vp"
                onChange={(e) => update({ [field]: cleanInput(e.target.value, false) })}
              />
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

function Results({ players }: { players: PlayerScores[] }) {
  const sheet = players.map((p) => breakdown(tally(p)));
  const places = standings(players.map((p, i) => ({ total: sheet[i].total, coins: num(p.coins) })));
  const placeOf = new Map(places.map((s) => [s.player, s.place]));
  // Before anyone has scored, everyone ties on 0: crown nobody yet.
  const scored = players.some(hasScores);
  const notes = !scored
    ? []
    : tieBreaks(
        places.map((s) => ({
          name: players[s.player].name,
          total: sheet[s.player].total,
          coins: num(players[s.player].coins),
          place: s.place,
        })),
      );
  return (
    <>
      <ScoreSheet
        players={players}
        rows={SHEET_ROWS.map((row) => ({
          key: row.key,
          label: (
            <>
              <span className="sc-sheet-label" style={{ color: COLORS[row.key] }}>
                <ScoreIcon kind={row.icon} />
              </span>
              {row.label}
            </>
          ),
          cells: players.map((p, i) => (
            <>
              {sheet[i][row.key]}
              {row.key === 'treasury' && num(p.coins) > 0 && (
                <span className="sc-sheet-sub">
                  <span className="sr-only">, from </span>
                  {num(p.coins)} coins
                </span>
              )}
            </>
          )),
        }))}
        totals={sheet.map((s) => s.total)}
        places={players.map((_, i) => (scored ? ordinal(placeOf.get(i)!) : '–'))}
        won={players.map((_, i) => scored && placeOf.get(i) === 1)}
      />
      {notes.map((note) => (
        <p key={note} className="sc-tie-note">
          {note}
        </p>
      ))}
      <p className="sc-tie-rule">A tie on points goes to the player with more coins.</p>
    </>
  );
}

/**
 * 7 Wonders' pad: a box for each category, VP for the pad's points and
 * coins for Treasury, the science boxes showing none, since their icons
 * say which symbol: the Science line says "symbols" once beside its
 * "= N VP", as Treasury's line does its own, both always shown, "= 0 VP"
 * included. The boxes open a phone's number pad, so military's minus comes
 * from its ± button. Results is a sheet like the printed pad, a tie on
 * points going to the player with more coins.
 */
export default function SevenWondersPad() {
  return (
    <PlayerScorePad<PlayerScores>
      storageKey="gameroom:score:7-wonders"
      minPlayers={2}
      maxPlayers={7}
      blank={blank}
      valid={(r) => SCORE_FIELDS.every((f) => isBoxText(r[f]))}
      hasScores={hasScores}
      form={(player, update) => <Form player={player} update={update} />}
      total={(p) => breakdown(tally(p)).total}
      unit="VP"
      results={(players) => <Results players={players} />}
    />
  );
}
