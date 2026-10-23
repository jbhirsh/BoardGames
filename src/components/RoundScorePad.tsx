import { useEffect, useId, useRef, useState } from 'react';
import { CARD_GAMES, type CardGameId, type CardGameRules } from '../data/scoreCalculators';
import {
  EUCHRE_TRICKS,
  HEARTS_HAND,
  SPADES_TRICKS,
  isRound,
  outcome,
  roundIssue,
  scoreRounds,
  type Round,
} from '../utils/cardGameScores';
import { cleanInput, num, showScore } from '../utils/scoreInput';
import { safeStorage } from '../client/safeStorage';
import ScoreInput, { SignButton } from './ScoreInput';
import { ScoreIcon } from './ScoreIcons';
import Notice from './Notice';

/** The game in progress: who plays (for Euchre, the two partnerships' names) and the rounds so far. */
interface Saved {
  names: string[];
  rounds: Round[];
}

/** A round being entered, as typed. */
interface Draft {
  /** Uno and Rummy: who went out. */
  out: number | null;
  /** Hearts: who shot the moon, if anyone. */
  moon: number | null;
  /** A box a player: the points left in their hand, taken, or their hole's score. */
  boxes: string[];
  /** Spades: each player's bid and tricks. */
  bids: string[];
  tricks: string[];
  /** Euchre: who chose trump, the tricks they took, and whether one went alone. */
  makers: 0 | 1 | null;
  taken: number | null;
  alone: boolean;
}

// Euchre is scored by partnership alone, so its pad names the two
// partnerships; Spades scores each player's bid, so it names all four.
const seats = (game: CardGameId, rules: CardGameRules) => (game === 'euchre' ? 2 : rules.minPlayers);

function startingNames(game: CardGameId, rules: CardGameRules): string[] {
  if (game === 'euchre') return ['Team 1', 'Team 2'];
  return Array.from({ length: seats(game, rules) }, (_, i) => `Player ${i + 1}`);
}

function emptyDraft(players: number): Draft {
  const boxes = Array<string>(players).fill('');
  return {
    out: null,
    moon: null,
    boxes,
    bids: ['', '', '', ''],
    tricks: ['', '', '', ''],
    makers: null,
    taken: null,
    alone: false,
  };
}

function draftOf(round: Round, players: number): Draft {
  const draft = emptyDraft(players);
  const text = (list: readonly number[]) => list.map(String);
  switch (round.game) {
    case 'uno':
    case 'rummy':
      return { ...draft, out: round.out, boxes: text(round.hands).map((h, i) => (i === round.out ? '' : h)) };
    case 'hearts':
      return { ...draft, moon: round.moon, boxes: round.moon === null ? text(round.taken) : draft.boxes };
    case 'golf':
      return { ...draft, boxes: text(round.scores) };
    case 'spades':
      return { ...draft, bids: text(round.bids), tricks: text(round.tricks) };
    case 'euchre':
      return { ...draft, makers: round.makers, taken: round.tricks, alone: round.alone };
  }
}

/** The round a draft makes, or what's still missing before it makes one. */
function roundOf(game: CardGameId, d: Draft): Round | string {
  const nums = (list: string[]) => list.map(num);
  switch (game) {
    case 'uno':
    case 'rummy':
      return d.out === null
        ? 'Choose who went out.'
        : { game, out: d.out, hands: nums(d.boxes).map((h, i) => (i === d.out ? 0 : h)) };
    case 'hearts':
      if (d.moon !== null) return { game, moon: d.moon, taken: d.boxes.map(() => 0) };
      return d.boxes.every((b) => b === '')
        ? 'Enter the points each player took.'
        : { game, moon: null, taken: nums(d.boxes) };
    case 'golf':
      return d.boxes.some((b) => b === '' || b === '-')
        ? "Enter every player's score, 0 included."
        : { game, scores: nums(d.boxes) };
    case 'spades':
      return [...d.bids, ...d.tricks].some((b) => b === '')
        ? "Enter every bid (0 for nil) and every player's tricks."
        : { game, bids: nums(d.bids), tricks: nums(d.tricks) };
    case 'euchre':
      if (d.makers === null) return 'Choose who chose trump.';
      return d.taken === null
        ? 'Choose how many tricks they took.'
        : { game, makers: d.makers, tricks: d.taken, alone: d.alone };
  }
}

function loadGame(game: CardGameId, rules: CardGameRules): Saved {
  const fresh = { names: startingNames(game, rules), rounds: [] };
  try {
    const saved: unknown = JSON.parse(safeStorage.get(`gameroom:score:${game}`) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return fresh;
    const { names, rounds } = saved as Record<string, unknown>;
    const counts = game === 'euchre' ? [2, 2] : [rules.minPlayers, rules.maxPlayers];
    if (
      !Array.isArray(names) ||
      names.length < counts[0] ||
      names.length > counts[1] ||
      !names.every((n: unknown): n is string => typeof n === 'string')
    )
      return fresh;
    const players = game === 'euchre' ? 4 : names.length;
    if (!Array.isArray(rounds) || !rounds.every((r: unknown): r is Round => isRound(game, players, r))) return fresh;
    return { names, rounds };
  } catch {
    return fresh;
  }
}

const signed = (n: number) => (n > 0 ? `+${n}` : showScore(n));

/** Two-way or many-way choice buttons, one pressed at a time. */
function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; name: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="rp-question">
      <span className="sc-label" id={id}>
        {label}
      </span>
      <div className="sc-seg rp-choice" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="sc-seg-btn"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The round-by-round pad the card games share (CARD_GAMES in
 * data/scoreCalculators.ts says how each is won; utils/cardGameScores.ts
 * scores it). Top to bottom, as a phone held at the table wants it:
 *   - Who's playing: names, and players added or taken away until the
 *     first round is in (a round holds a score for each). Spades names the
 *     four players, partners sitting opposite; Euchre names the two
 *     partnerships, since it scores only them.
 *   - The standings: each player's or partnership's total (and Spades'
 *     bags), the leader crowned, and how the game ends, or who won.
 *   - The next round's entry, its form the game's own: who went out and
 *     the points left in each hand (Uno, Rummy); the points each player
 *     took, or who shot the moon (Hearts); each player's hole (Golf, its
 *     minus from a ± button); each player's bid and tricks (Spades); who
 *     chose trump, their tricks, and whether one went alone (Euchre).
 *     What's missing is said under the button; what doesn't add up once
 *     it's all in (a Hearts hand that isn't 26, a Spades hand that isn't
 *     13 tricks) is said too, but doesn't stop the round going in. A Hearts
 *     hand part-way in says how far it's come instead.
 *   - Every round so far, each one's name a button that loads it back into
 *     the form to fix or delete.
 *   - How the game is scored, as the pad applies it.
 * New game keeps the players and clears the rounds, asking first. The game
 * in progress is kept in localStorage.
 */
export default function RoundScorePad({ game }: { game: CardGameId }) {
  const rules = CARD_GAMES[game];
  const [initial] = useState(() => loadGame(game, rules));
  const [names, setNames] = useState(initial.names);
  const [rounds, setRounds] = useState(initial.rounds);
  // A box a player, or for Spades the four players' bids and tricks.
  const players = game === 'euchre' ? 4 : names.length;
  const [draft, setDraft] = useState(() => emptyDraft(players));
  // The round being fixed, or null when the form enters the next.
  const [editing, setEditing] = useState<number | null>(null);
  const [said, setSaid] = useState('');
  const formId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    safeStorage.set(`gameroom:score:${game}`, JSON.stringify({ names, rounds }));
  }, [game, names, rounds]);

  // A round to fix opens in the form, which may be a screen away from the
  // sheet it was chosen from (or, the game over, only now shown): take the
  // reader there, focus at its heading.
  useEffect(() => {
    if (editing === null) return;
    titleRef.current?.scrollIntoView?.({ block: 'start' });
    titleRef.current?.focus({ preventScroll: true });
  }, [editing]);

  // A name cleared in its box still needs one wherever it labels a box or
  // a button: its seat's.
  const shown = names.map((n, i) => n.trim() || (game === 'euchre' ? `Team ${i + 1}` : `Player ${i + 1}`));
  const columns = rules.teams ? 2 : names.length;
  const columnNames = game === 'spades' ? [`${shown[0]} & ${shown[2]}`, `${shown[1]} & ${shown[3]}`] : shown;
  const { points, totals, bags } = scoreRounds(rounds, columns);
  const result = outcome(rules.goal, totals, rounds.length);
  const roundName = (i: number) => `${rules.round} ${i + 1}`;
  const made = roundOf(game, draft);
  // A Hearts hand being typed in falls short of 26 until its last box is
  // in: that's progress, said plainly. Only a hand with every box filled,
  // or one already past 26, that doesn't add up gets the warning.
  const heartsSoFar =
    game === 'hearts' && draft.moon === null && draft.boxes.some((b) => b === '')
      ? draft.boxes.reduce((sum, b) => sum + num(b), 0)
      : null;
  const issue =
    typeof made === 'string' || (heartsSoFar !== null && heartsSoFar < HEARTS_HAND) ? null : roundIssue(made);
  const preview = typeof made === 'string' ? null : scoreRounds([made], columns).points[0];

  const setBox = (field: 'boxes' | 'bids' | 'tricks', i: number, text: string) =>
    setDraft((d) => ({ ...d, [field]: d[field].map((b, j) => (j === i ? text : b)) }));

  function rename(i: number, name: string) {
    setNames((prev) => prev.map((n, j) => (j === i ? name : n)));
  }

  function addPlayer() {
    setNames((prev) => [...prev, `Player ${prev.length + 1}`]);
    setDraft(emptyDraft(players + 1));
  }

  function removePlayer(i: number) {
    setNames((prev) => prev.filter((_, j) => j !== i));
    setDraft(emptyDraft(players - 1));
  }

  function save() {
    if (typeof made === 'string') return;
    const index = editing ?? rounds.length;
    setRounds((prev) => (editing === null ? [...prev, made] : prev.map((r, i) => (i === editing ? made : r))));
    setDraft(emptyDraft(players));
    setEditing(null);
    setSaid(`${roundName(index)} ${editing === null ? 'added' : 'saved'}.`);
  }

  function edit(i: number) {
    setEditing(i);
    setDraft(draftOf(rounds[i], players));
    setSaid(`Editing ${roundName(i).toLowerCase()}.`);
  }

  function cancel() {
    setEditing(null);
    setDraft(emptyDraft(players));
    setSaid('');
  }

  function remove() {
    if (editing === null) return;
    if (!window.confirm(`Delete ${roundName(editing).toLowerCase()}?`)) return;
    setRounds((prev) => prev.filter((_, i) => i !== editing));
    setSaid(`${roundName(editing)} deleted.`);
    setEditing(null);
    setDraft(emptyDraft(players));
  }

  function newGame() {
    if (rounds.length > 0 && !window.confirm('Clear every round and start a new game? The players stay.')) return;
    setRounds([]);
    setEditing(null);
    setDraft(emptyDraft(players));
    setSaid('New game started.');
  }

  const winners = result.leaders.map((i) => columnNames[i]);
  const goal =
    'to' in rules.goal
      ? `First to ${rules.goal.to}${rules.goal.low ? '; then the lowest score wins' : ' wins'}.`
      : `${rules.goal.rounds} ${rules.round.toLowerCase()}s; the lowest total wins.`;
  const status =
    rounds.length === 0
      ? goal
      : result.over
        ? `${winners.join(' and ')} ${winners.length > 1 ? 'tie for the win' : 'wins'} on ${showScore(totals[result.leaders[0]])}.`
        : `${goal} ${'rounds' in rules.goal ? `${rounds.length} of ${rules.goal.rounds} played.` : ''}`.trim();

  return (
    <>
      <details className="sc-setup rp-players" open={rounds.length === 0 || undefined}>
        <summary className="sc-setup-title">
          {game === 'euchre' ? 'Partnerships' : 'Players'}
          <span className="sc-vp-note">{shown.join(', ')}</span>
        </summary>
        {game === 'spades' && <p className="sc-hint">Partners sit opposite: players 1 and 3 against 2 and 4.</p>}
        <div className="rp-names">
          {names.map((name, i) => (
            <div key={i} className="rp-name">
              <label className="sr-only" htmlFor={`rp-name-${i}`}>
                {game === 'euchre' ? `Partnership ${i + 1}` : `Player ${i + 1}`} name
              </label>
              <input
                id={`rp-name-${i}`}
                className="sc-input sc-name-input"
                type="text"
                value={name}
                onChange={(e) => rename(i, e.target.value)}
              />
              {rounds.length === 0 && names.length > rules.minPlayers && !rules.teams && (
                <button
                  type="button"
                  className="sc-remove"
                  aria-label={`Remove ${shown[i]}`}
                  onClick={() => removePlayer(i)}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
        {rounds.length === 0 && names.length < rules.maxPlayers && !rules.teams && (
          <button type="button" className="sc-add-row" onClick={addPlayer}>
            + Add player
          </button>
        )}
        {rounds.length > 0 && !rules.teams && (
          <p className="sc-hint">Players can be added or removed before the first {rules.round.toLowerCase()}.</p>
        )}
      </details>

      <section className="sc-panel rp-standings" aria-label="Standings">
        <ul className="rp-totals">
          {columnNames.map((name, i) => {
            const leads = rounds.length > 0 && result.leaders.includes(i);
            return (
              <li key={i} className={`rp-total${leads ? ' sc-win' : ''}`}>
                <span className="rp-total-name">
                  {leads && <ScoreIcon kind="winner" />}
                  {name}
                </span>
                <span className="rp-total-num">{showScore(totals[i])}</span>
                {bags && (
                  <span className="sc-sheet-sub">
                    {bags[i]} {bags[i] === 1 ? 'bag' : 'bags'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="rp-status" role="status">
          {status}
        </p>
        {result.over && editing === null && (
          <button type="button" className="sc-next" onClick={newGame}>
            New game
          </button>
        )}
      </section>

      {(!result.over || editing !== null) && (
        <section className="sc-panel rp-entry" id={formId} aria-labelledby={`${formId}-title`}>
          <h2 className="rp-entry-title" id={`${formId}-title`} ref={titleRef} tabIndex={-1}>
            {editing === null ? roundName(rounds.length) : `Fix ${roundName(editing).toLowerCase()}`}
          </h2>
          <div className="sc-form">
            {(game === 'uno' || game === 'rummy') && (
              <>
                <Choice
                  label="Who went out?"
                  options={shown.map((n, i) => ({ value: i, name: n }))}
                  value={draft.out}
                  onChange={(out) => setDraft((d) => ({ ...d, out }))}
                />
                {draft.out !== null && (
                  <>
                    <p className="sc-hint">
                      Points left in each hand:{' '}
                      {game === 'uno'
                        ? 'number cards their face value, Draw Two, Reverse and Skip 20, Wilds 50.'
                        : 'face cards 10, aces 1, the rest their face value.'}
                    </p>
                    {shown.map(
                      (n, i) =>
                        i !== draft.out && (
                          <div key={i} className="sc-row">
                            <label className="sc-label" htmlFor={`rp-box-${i}`}>
                              {n}
                            </label>
                            <ScoreInput
                              id={`rp-box-${i}`}
                              unit="pts"
                              value={draft.boxes[i]}
                              onChange={(e) => setBox('boxes', i, cleanInput(e.target.value, false, 999))}
                            />
                          </div>
                        ),
                    )}
                  </>
                )}
              </>
            )}

            {game === 'hearts' && (
              <>
                <Choice
                  label="Did anyone shoot the moon?"
                  options={[{ value: -1, name: 'No' }, ...shown.map((n, i) => ({ value: i, name: n }))]}
                  value={draft.moon ?? -1}
                  onChange={(m) => setDraft((d) => ({ ...d, moon: m === -1 ? null : m }))}
                />
                {draft.moon === null ? (
                  shown.map((n, i) => (
                    <div key={i} className="sc-row">
                      <label className="sc-label" htmlFor={`rp-box-${i}`}>
                        {n}
                      </label>
                      <ScoreInput
                        id={`rp-box-${i}`}
                        unit="pts"
                        value={draft.boxes[i]}
                        onChange={(e) => setBox('boxes', i, cleanInput(e.target.value, false, HEARTS_HAND))}
                      />
                    </div>
                  ))
                ) : (
                  <p className="sc-hint">
                    {shown[draft.moon]} scores 0 and everyone else {HEARTS_HAND}.
                  </p>
                )}
              </>
            )}

            {game === 'golf' &&
              shown.map((n, i) => (
                <div key={i} className="sc-row">
                  <label className="sc-label" htmlFor={`rp-box-${i}`}>
                    {n}
                  </label>
                  <div className="sc-input-wrap">
                    <SignButton
                      label={`± Switch ${n}'s sign`}
                      value={num(draft.boxes[i])}
                      onFlip={() => setBox('boxes', i, String(-num(draft.boxes[i])))}
                    />
                    <ScoreInput
                      id={`rp-box-${i}`}
                      unit="pts"
                      negative
                      value={draft.boxes[i]}
                      onChange={(e) => setBox('boxes', i, cleanInput(e.target.value, true, 99))}
                    />
                  </div>
                </div>
              ))}

            {game === 'spades' && (
              <>
                <p className="sc-hint">Bid 0 for nil.</p>
                <div className="rp-spades">
                  <div className="rp-spades-row" aria-hidden="true">
                    <span />
                    <span className="rp-col-head">Bid</span>
                    <span className="rp-col-head">Tricks</span>
                  </div>
                  {shown.map((n, i) => (
                    <div key={i} className="rp-spades-row">
                      <span className="sc-label">{n}</span>
                      <ScoreInput
                        id={`rp-bid-${i}`}
                        label={`${n} bid`}
                        value={draft.bids[i]}
                        onChange={(e) => setBox('bids', i, cleanInput(e.target.value, false, SPADES_TRICKS))}
                      />
                      <ScoreInput
                        id={`rp-tricks-${i}`}
                        label={`${n} tricks`}
                        value={draft.tricks[i]}
                        onChange={(e) => setBox('tricks', i, cleanInput(e.target.value, false, SPADES_TRICKS))}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {game === 'euchre' && (
              <>
                <Choice
                  label="Who chose trump?"
                  options={shown.map((n, i) => ({ value: i as 0 | 1, name: n }))}
                  value={draft.makers}
                  onChange={(makers) => setDraft((d) => ({ ...d, makers }))}
                />
                <Choice
                  label="Tricks they took"
                  options={Array.from({ length: EUCHRE_TRICKS + 1 }, (_, t) => ({ value: t, name: String(t) }))}
                  value={draft.taken}
                  onChange={(taken) => setDraft((d) => ({ ...d, taken }))}
                />
                <label className="sc-check">
                  <input
                    type="checkbox"
                    checked={draft.alone}
                    onChange={(e) => setDraft((d) => ({ ...d, alone: e.target.checked }))}
                  />
                  <span>One of them went alone</span>
                </label>
              </>
            )}

            {preview && (
              <p className="rp-preview">{columnNames.map((n, i) => `${n} ${signed(preview[i])}`).join(' · ')}</p>
            )}
            {heartsSoFar !== null && heartsSoFar > 0 && heartsSoFar < HEARTS_HAND && (
              <p className="sc-hint">
                {heartsSoFar} of the hand&apos;s {HEARTS_HAND} points so far.
              </p>
            )}
            {issue && <Notice tone="warning">{issue}</Notice>}

            <div className="rp-actions">
              {editing !== null && (
                <>
                  <button type="button" className="sc-new-game" onClick={remove}>
                    Delete
                  </button>
                  <button type="button" className="sc-new-game" onClick={cancel}>
                    Cancel
                  </button>
                </>
              )}
              <button
                type="button"
                className="sc-next rp-save"
                onClick={save}
                disabled={typeof made === 'string'}
                aria-describedby={typeof made === 'string' ? `${formId}-missing` : undefined}
              >
                {editing === null ? `Add ${roundName(rounds.length).toLowerCase()}` : 'Save'}
              </button>
            </div>
            {typeof made === 'string' && (
              <p className="sc-hint rp-missing" id={`${formId}-missing`}>
                {made}
              </p>
            )}
          </div>
        </section>
      )}
      <p className="sr-only" aria-live="polite">
        {said}
      </p>

      {rounds.length > 0 && (
        <div className="sc-panel">
          <div className="sc-sheet-wrap">
            <table className="sc-sheet rp-sheet">
              <caption className="sr-only">Scores by {rules.round.toLowerCase()}</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">{rules.round}</span>
                  </th>
                  {columnNames.map((n, i) => (
                    <th key={i} scope="col">
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {points.map((row, r) => (
                  <tr key={r} className={editing === r ? 'rp-editing' : undefined}>
                    <th scope="row">
                      <button
                        type="button"
                        className="rp-round-btn"
                        aria-label={`Fix ${roundName(r).toLowerCase()}`}
                        onClick={() => edit(r)}
                      >
                        {r + 1}
                      </button>
                    </th>
                    {row.map((p, i) => (
                      <td key={i}>{showScore(p)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="sc-sheet-total">
                  <th scope="row">Total</th>
                  {totals.map((t, i) => (
                    <td key={i}>{showScore(t)}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="sc-tie-rule rp-rule">{rules.rule}</p>
      <div className="sc-actions">
        <button type="button" className="sc-new-game" onClick={newGame}>
          New game
        </button>
      </div>
    </>
  );
}
