import { useSavedState } from '../hooks/useSavedState';
import {
  LONGEST_BONUS, ROUTE_LENGTHS, ROUTE_POINTS, STATION_POINTS, STATIONS, ttrBreakdown, ttrTieBreaks,
  type TtrBreakdown, type TtrMap, type TtrTally,
} from '../utils/ticketToRide';
import { cleanInput, isBoxText, num, showScore } from '../utils/scoreInput';
import { ordinal, places, tieNotes } from '../utils/standings';
import PlayerScorePad, { ScoreSheet, type PadPlayer } from './PlayerScorePad';
import ScoreInput, { CountRow } from './ScoreInput';

// Every length either map has, so a player's routes survive a change of map.
const LENGTHS = [...new Set([...ROUTE_LENGTHS.usa, ...ROUTE_LENGTHS.europe])];

interface TicketText { points: string; made: boolean }

/** A player's boxes, as typed. */
interface TtrPlayer extends PadPlayer {
  routes: Record<string, string>;
  tickets: TicketText[];
  longest: boolean;
  stations: string;
}

const MAPS: Record<TtrMap, { name: string; longest: string }> = {
  usa: { name: 'United States', longest: 'Longest Continuous Path' },
  europe: { name: 'Europe', longest: 'European Express' },
};

function blank() {
  return { routes: Object.fromEntries(LENGTHS.map(l => [l, ''])), tickets: [], longest: false, stations: '' };
}

function valid(r: Record<string, unknown>): boolean {
  const routes = r.routes as Record<string, unknown> | null;
  return typeof routes === 'object' && routes !== null && LENGTHS.every(l => isBoxText(routes[l]))
    && Array.isArray(r.tickets) && r.tickets.every((t: unknown) =>
      typeof t === 'object' && t !== null && isBoxText((t as TicketText).points) && typeof (t as TicketText).made === 'boolean')
    && typeof r.longest === 'boolean' && isBoxText(r.stations);
}

function tally(p: TtrPlayer): TtrTally {
  return {
    routes: Object.fromEntries(LENGTHS.map(l => [l, num(p.routes[l])])),
    tickets: p.tickets.map(t => ({ points: num(t.points), made: t.made })),
    longest: p.longest,
    stationsLeft: num(p.stations),
  };
}

function hasScores(p: TtrPlayer): boolean {
  return LENGTHS.some(l => num(p.routes[l]) > 0) || p.tickets.some(t => num(t.points) > 0) || p.longest || num(p.stations) > 0;
}

const pts = (n: number) => `${n} ${Math.abs(n) === 1 ? 'point' : 'points'}`;

function Form({ map, player, update }: { map: TtrMap; player: TtrPlayer; update: (patch: Partial<Omit<TtrPlayer, keyof PadPlayer>>) => void }) {
  const b = ttrBreakdown(map, tally(player));
  const setTicket = (i: number, patch: Partial<TicketText>) =>
    update({ tickets: player.tickets.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  return (
    <>
      <fieldset className="sc-group">
        <legend className="sc-group-title">Routes <span className="sc-vp-note">= {pts(b.routes)}</span></legend>
        {ROUTE_LENGTHS[map].map(len => (
          <CountRow
            key={len}
            id={`sc-route-${len}`}
            label={`${len}-train ${len === 1 ? 'route' : 'routes'}`}
            worth={`${pts(ROUTE_POINTS[len])} each`}
            unit={num(player.routes[len]) === 1 ? 'route' : 'routes'}
            value={player.routes[len]}
            points={`= ${pts(num(player.routes[len]) * ROUTE_POINTS[len])}`}
            onChange={(text) => update({ routes: { ...player.routes, [len]: cleanInput(text, false, 99) } })}
          />
        ))}
      </fieldset>

      <fieldset className="sc-group">
        <legend className="sc-group-title">
          Destination tickets <span className="sc-vp-note">= {pts(b.made + b.missed)}</span>
        </legend>
        {player.tickets.length === 0 && <p className="sc-hint">Add each ticket you kept, with the points printed on it.</p>}
        {player.tickets.map((t, i) => (
          <div key={i} className="sc-ticket">
            <ScoreInput
              id={`sc-ticket-${i}`}
              label={`Ticket ${i + 1} points`}
              unit="pts"
              value={t.points}
              onChange={(e) => setTicket(i, { points: cleanInput(e.target.value, false, 99) })}
            />
            <div className="sc-seg" role="group" aria-label={`Ticket ${i + 1}`}>
              <button type="button" className="sc-seg-btn" aria-pressed={t.made} onClick={() => setTicket(i, { made: true })}>Made</button>
              <button type="button" className="sc-seg-btn" aria-pressed={!t.made} onClick={() => setTicket(i, { made: false })}>Missed</button>
            </div>
            <button
              type="button"
              className="sc-remove"
              aria-label={`Remove ticket ${i + 1}`}
              onClick={() => update({ tickets: player.tickets.filter((_, j) => j !== i) })}
            >
              &times;
            </button>
          </div>
        ))}
        <button type="button" className="sc-add-row" onClick={() => update({ tickets: [...player.tickets, { points: '', made: true }] })}>
          + Add ticket
        </button>
      </fieldset>

      <label className="sc-check">
        <input type="checkbox" checked={player.longest} onChange={(e) => update({ longest: e.target.checked })} />
        <span>
          {MAPS[map].longest}
          <span className="sc-vp-note">+{LONGEST_BONUS}; every player tied for the longest scores it</span>
        </span>
      </label>

      {map === 'europe' && (
        <CountRow
          id="sc-stations"
          label="Stations kept"
          worth={`${pts(STATION_POINTS)} each, of ${STATIONS}`}
          unit="kept"
          value={player.stations}
          points={`= ${pts(b.stations)}`}
          onChange={(text) => update({ stations: cleanInput(text, false, STATIONS) })}
        />
      )}
    </>
  );
}

const SHEET_ROWS: { key: keyof TtrBreakdown; label: string; europe?: boolean }[] = [
  { key: 'routes', label: 'Routes' },
  { key: 'made', label: 'Tickets completed' },
  { key: 'missed', label: 'Tickets missed' },
  { key: 'longest', label: 'Longest path' },
  { key: 'stations', label: 'Stations', europe: true },
];

function Results({ map, players }: { map: TtrMap; players: TtrPlayer[] }) {
  const tallies = players.map(tally);
  const sheet = tallies.map(t => ttrBreakdown(map, t));
  const totals = sheet.map(s => s.total);
  const breaks = ttrTieBreaks(map, tallies);
  const placed = places(totals, breaks);
  const scored = players.some(hasScores);
  const names = players.map(p => p.name);
  return (
    <>
      <ScoreSheet
        players={players}
        rows={SHEET_ROWS.filter(r => !r.europe || map === 'europe').map(row => ({
          key: row.key,
          label: row.key === 'longest' ? MAPS[map].longest : row.label,
          cells: sheet.map(s => showScore(s[row.key])),
        }))}
        totals={totals.map(showScore)}
        places={placed.map(p => (scored ? ordinal(p) : '–'))}
        won={placed.map(p => scored && p === 1)}
      />
      {scored && tieNotes(names, totals.map(pts), totals, breaks).map(note => <p key={note} className="sc-tie-note">{note}</p>)}
      <p className="sc-tie-rule">
        A tie on points goes to the player who completed more tickets
        {map === 'europe' ? ', then to the one who built fewer stations' : ''}, then to the holder of the {MAPS[map].longest} card.
      </p>
    </>
  );
}

/**
 * Ticket to Ride's pad, for the map the table played (the US or Europe,
 * kept with the game). Each player counts their routes by length, the pad
 * turning them into points by the Route Scoring Table, adds each ticket
 * they kept as completed or missed, ticks the longest path bonus (every
 * player tied for it does), and in Europe counts the stations they never
 * built. Results ranks the table with the rulebook's tie-breaks.
 */
export default function TicketToRidePad() {
  const [map, setMap] = useSavedState<TtrMap>('gameroom:score:ticket-to-ride:map', 'usa', (v) => (v === 'usa' || v === 'europe' ? v : null));
  return (
    <PlayerScorePad<TtrPlayer>
      storageKey="gameroom:score:ticket-to-ride"
      minPlayers={2}
      maxPlayers={5}
      blank={blank}
      valid={valid}
      hasScores={hasScores}
      setup={(
        <section className="sc-setup" aria-labelledby="sc-map-title">
          <h2 className="sc-setup-title" id="sc-map-title">Map</h2>
          <div className="sc-seg" role="group" aria-labelledby="sc-map-title">
            {(['usa', 'europe'] as const).map(m => (
              <button key={m} type="button" className="sc-seg-btn" aria-pressed={map === m} onClick={() => setMap(m)}>
                {MAPS[m].name}
              </button>
            ))}
          </div>
        </section>
      )}
      form={(player, update) => <Form map={map} player={player} update={update} />}
      total={(p) => ttrBreakdown(map, tally(p)).total}
      unit="points"
      results={(players) => <Results map={map} players={players} />}
    />
  );
}
