import type { Filterable } from '../data/types';

/** Lighter than this (BoardGameGeek weight) reads as Light; from HEAVY up, Heavy. */
export const LIGHT_BELOW = 2;
export const HEAVY_FROM = 3;

/** Light, Medium or Heavy for a BoardGameGeek weight. */
export function weightWord(weight: number): 'Light' | 'Medium' | 'Heavy' {
  if (weight < LIGHT_BELOW) return 'Light';
  return weight < HEAVY_FROM ? 'Medium' : 'Heavy';
}

/** BGG's weight as shown, to one place. */
const shown = (weight: number) => Math.round(weight * 10) / 10;

/**
 * "Medium · 2.3": the word for the table, the number for anyone who knows
 * the scale. The word is the shown number's, so 1.96 reads "Medium · 2.0",
 * never "Light · 2.0".
 */
export function weightLabel(weight: number): string {
  return `${weightWord(shown(weight))} · ${shown(weight).toFixed(1)}`;
}

const range = (lo: string, hi: string) => (lo === hi ? lo : `${lo}–${hi}`);

/**
 * What a card or row shows for how hard a game is to learn: its own weight,
 * "Medium · 2.3", or for a deck (which has none) the span of its games',
 * "Light · 1.0–1.9". Null when BoardGameGeek rates none of it, and for a
 * wishlist entry.
 */
export function difficultyOf(item: Pick<Filterable, 'weight' | 'subgames'>): string | null {
  if (item.weight !== undefined) return weightLabel(item.weight);
  const weights = (item.subgames ?? []).flatMap((s) => (s.weight === undefined ? [] : [s.weight]));
  if (weights.length === 0) return null;
  const [lo, hi] = [shown(Math.min(...weights)), shown(Math.max(...weights))];
  return `${range(weightWord(lo), weightWord(hi))} · ${range(lo.toFixed(1), hi.toFixed(1))}`;
}
