import { useSavedState } from '../hooks/useSavedState';
import { BASE_CARDS, KINGDOM_CARDS, dominionBreakdown, type DominionTally, type KingdomCard } from '../utils/dominion';
import { cleanInput, isBoxText, num, showScore } from '../utils/scoreInput';
import { ordinal, places, tieNotes } from '../utils/standings';
import PlayerScorePad, { ScoreSheet, type PadPlayer } from './PlayerScorePad';
import { CountRow } from './ScoreInput';

const FIELDS = ['estates', 'duchies', 'provinces', 'curses', 'gardens', 'deck', 'duke', 'harem', 'mill', 'nobles'] as const;
type Field = typeof FIELDS[number];

/** A player's boxes, as typed. */
type DominionPlayer = PadPlayer & Record<Field, string>;

const KINGDOM_KEYS: readonly KingdomCard[] = KINGDOM_CARDS.map(c => c.key);

function blank(): Record<Field, string> {
  return Object.fromEntries(FIELDS.map(f => [f, ''])) as Record<Field, string>;
}

function tally(p: DominionPlayer): DominionTally {
  return Object.fromEntries(FIELDS.map(f => [f, num(p[f])])) as DominionTally;
}

function hasScores(p: DominionPlayer): boolean {
  return FIELDS.some(f => num(p[f]) > 0);
}

const vp = (n: number) => `${showScore(n)} VP`;

function Form({ kingdom, player, update }: { kingdom: ReadonlySet<KingdomCard>; player: DominionPlayer; update: (patch: Partial<Record<Field, string>>) => void }) {
  const b = dominionBreakdown(tally(player), kingdom);
  const row = (key: Exclude<Field, 'deck'>, label: string, worth: string) => (
    <CountRow
      key={key}
      id={`sc-${key}`}
      label={label}
      worth={worth}
      unit={num(player[key]) === 1 ? 'card' : 'cards'}
      value={player[key]}
      points={`= ${vp(b[key])}`}
      onChange={(text) => update({ [key]: cleanInput(text, false, 99) })}
    />
  );
  return (
    <>
      {BASE_CARDS.map(c => row(c.key, c.name, `${showScore(c.vp)} VP each`))}
      {KINGDOM_CARDS.filter(c => kingdom.has(c.key)).map(c => row(c.key, c.name, c.worth))}
      {kingdom.has('gardens') && (
        <CountRow
          id="sc-deck"
          label="Cards in your deck"
          worth="Every card you have, for Gardens"
          unit={num(player.deck) === 1 ? 'card' : 'cards'}
          value={player.deck}
          points={`${Math.floor(num(player.deck) / 10)} VP a Gardens`}
          onChange={(text) => update({ deck: cleanInput(text, false, 999) })}
        />
      )}
    </>
  );
}

function Results({ kingdom, players }: { kingdom: ReadonlySet<KingdomCard>; players: DominionPlayer[] }) {
  const sheet = players.map(p => dominionBreakdown(tally(p), kingdom));
  const totals = sheet.map(s => s.total);
  const placed = places(totals);
  const scored = players.some(hasScores);
  const rows = [
    ...BASE_CARDS.map(c => ({ key: c.key, label: c.name })),
    ...KINGDOM_CARDS.filter(c => kingdom.has(c.key)).map(c => ({ key: c.key, label: c.name })),
  ];
  return (
    <>
      <ScoreSheet
        players={players}
        rows={rows.map(r => ({ key: r.key, label: r.label, cells: sheet.map(s => showScore(s[r.key])) }))}
        totals={totals.map(showScore)}
        places={placed.map(p => (scored ? ordinal(p) : '–'))}
        won={placed.map(p => scored && p === 1)}
      />
      {scored && tieNotes(players.map(p => p.name), totals.map(vp), totals, []).map(note => <p key={note} className="sc-tie-note">{note}</p>)}
      <p className="sc-tie-rule">A tie on points goes to the player who had fewer turns; tied on turns too, they share the win.</p>
    </>
  );
}

/**
 * Dominion's pad. The table first ticks the Kingdom cards in its Supply
 * that score (Gardens from the base game; Duke, Harem, Mill and Nobles
 * from Intrigue), kept with the game, and only those get a box. Each
 * player then counts their Estates, Duchies, Provinces and Curses and
 * those Kingdom cards, with the size of their deck where Gardens is in
 * play; the pad does the arithmetic, Dukes counting the player's Duchies.
 * Turns aren't counted, so a tie on points is left to the table, as the
 * rulebook settles it on turns taken.
 */
export default function DominionPad() {
  const [kingdom, setKingdom] = useSavedState<KingdomCard[]>(
    'gameroom:score:dominion:kingdom',
    [],
    (v) => (Array.isArray(v) && v.every(c => KINGDOM_KEYS.includes(c)) ? v : null),
  );
  const inPlay = new Set(kingdom);
  const toggle = (card: KingdomCard, on: boolean) =>
    setKingdom(KINGDOM_KEYS.filter(c => (c === card ? on : inPlay.has(c))));
  return (
    <PlayerScorePad<DominionPlayer>
      storageKey="gameroom:score:dominion"
      minPlayers={2}
      maxPlayers={6}
      blank={blank}
      valid={(r) => FIELDS.every(f => isBoxText(r[f]))}
      hasScores={hasScores}
      setup={(
        <section className="sc-setup" aria-labelledby="sc-kingdom-title">
          <h2 className="sc-setup-title" id="sc-kingdom-title">Kingdom cards that score</h2>
          <p className="sc-hint">Tick the ones in this game&apos;s Supply.</p>
          <div className="sc-chips">
            {KINGDOM_CARDS.map(c => (
              <label key={c.key} className="sc-chip">
                <input type="checkbox" checked={inPlay.has(c.key)} onChange={(e) => toggle(c.key, e.target.checked)} />
                {c.name}
              </label>
            ))}
          </div>
        </section>
      )}
      onNewGame={() => setKingdom([])}
      form={(player, update) => <Form kingdom={inPlay} player={player} update={update} />}
      total={(p) => dominionBreakdown(tally(p), inPlay).total}
      unit="VP"
      results={(players) => <Results kingdom={inPlay} players={players} />}
    />
  );
}
