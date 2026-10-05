/**
 * Games with a score calculator at /score/<slug>. The calculator itself
 * scores 7 Wonders only, so a new game here needs its own scoring too.
 */
export const SCORE_CALCULATORS: ReadonlySet<string> = new Set(['7-wonders']);
