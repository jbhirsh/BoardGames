import type { Game } from '../data/types';

/**
 * Human-readable duration for a play time in minutes.
 * Under an hour stays in minutes; an hour or more reads as hours, keeping
 * one decimal place only when the value is not whole.
 */
export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  // Round to the displayed precision first. Without it, a duration that is
  // not a whole number of minutes-per-hour reads as "1.0 hrs" rather than
  // "1 hr", because the integer check runs against the unrounded quotient.
  const hrs = Math.round((mins / 60) * 10) / 10;
  const label = Number.isInteger(hrs) ? String(hrs) : hrs.toFixed(1);
  return `${label} ${hrs === 1 ? 'hr' : 'hrs'}`;
}

/**
 * Shortest and longest play time across the collection.
 *
 * Derived rather than written by hand: the hero used to state "10 min" and
 * "8 hrs" as string literals with no link to the data, so adding or removing
 * a game would have made it quietly wrong with nothing to catch it.
 */
export function collectionSpan(games: Game[]): { shortest: string; longest: string } {
  const mins = games.map((g) => g.mins);
  return {
    shortest: formatMinutes(Math.min(...mins)),
    longest: formatMinutes(Math.max(...mins)),
  };
}
