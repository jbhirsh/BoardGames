// Ticket to Ride's final scoring, for the score pad
// (components/TicketToRidePad.tsx), from the rulebooks in public/rules:
// the US map (ticket-to-ride.pdf) and Europe (ticket-to-ride.europe.pdf).
import type { TieBreak } from './standings';

export type TtrMap = 'usa' | 'europe';

/** A route's points by its length, the Route Scoring Table both rulebooks print. */
export const ROUTE_POINTS: Readonly<Record<number, number>> = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15, 8: 21 };

/** The route lengths each map has: Europe has none of 5 and one of 8. */
export const ROUTE_LENGTHS: Readonly<Record<TtrMap, readonly number[]>> = {
  usa: [1, 2, 3, 4, 5, 6],
  europe: [1, 2, 3, 4, 6, 8],
};

/** The Longest Continuous Path card (the European Express in Europe); tied players each score it. */
export const LONGEST_BONUS = 10;
/** Each Train Station kept in reserve, in Europe; every player has three. */
export const STATION_POINTS = 4;
export const STATIONS = 3;

/** A Destination Ticket kept: its value, and whether its cities were joined. */
interface Ticket {
  points: number;
  made: boolean;
}

/** What a player counts at the end. */
export interface TtrTally {
  /** How many routes the player claimed, by length. */
  routes: Readonly<Record<number, number>>;
  tickets: readonly Ticket[];
  /** Holds the longest path card (shared on a tie). */
  longest: boolean;
  /** Stations never built, in Europe. */
  stationsLeft: number;
}

export interface TtrBreakdown {
  routes: number;
  /** Completed tickets' points. */
  made: number;
  /** Failed tickets' points, as a negative number. */
  missed: number;
  longest: number;
  stations: number;
  total: number;
  /** How many tickets were completed: the first tie-break. */
  ticketsMade: number;
}

export function routePoints(map: TtrMap, routes: Readonly<Record<number, number>>): number {
  return ROUTE_LENGTHS[map].reduce((sum, len) => sum + (routes[len] ?? 0) * ROUTE_POINTS[len], 0);
}

/** A player's score by category, only the map's own routes and (in Europe) stations counting. */
export function ttrBreakdown(map: TtrMap, t: TtrTally): TtrBreakdown {
  const routes = routePoints(map, t.routes);
  const made = t.tickets.filter((k) => k.made).reduce((sum, k) => sum + k.points, 0);
  const missed = 0 - t.tickets.filter((k) => !k.made).reduce((sum, k) => sum + k.points, 0);
  const longest = t.longest ? LONGEST_BONUS : 0;
  const stations = map === 'europe' ? Math.min(t.stationsLeft, STATIONS) * STATION_POINTS : 0;
  return {
    routes,
    made,
    missed,
    longest,
    stations,
    total: routes + made + missed + longest + stations,
    ticketsMade: t.tickets.filter((k) => k.made && k.points > 0).length,
  };
}

/**
 * The rulebooks' tie-breaks after points: most tickets completed, then
 * (in Europe) fewest stations built, then the longest path card.
 */
export function ttrTieBreaks(map: TtrMap, tallies: readonly TtrTally[]): TieBreak[] {
  const made: TieBreak = { label: 'tickets completed', values: tallies.map((t) => ttrBreakdown(map, t).ticketsMade) };
  const kept: TieBreak = { label: 'stations kept', values: tallies.map((t) => Math.min(t.stationsLeft, STATIONS)) };
  const card: TieBreak = {
    label: 'the longest path card',
    values: tallies.map((t) => (t.longest ? 1 : 0)),
    show: (has) => (has ? 'has it' : "doesn't"),
  };
  return map === 'europe' ? [made, kept, card] : [made, card];
}
