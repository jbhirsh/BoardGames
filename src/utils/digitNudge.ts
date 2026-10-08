/** Where a line of text sits, in px from the top of its line box. */
export interface LineMetrics {
  /** Height of the line box. */
  height: number;
  /** The baseline, down from the line box's top. */
  baseline: number;
  /** The font's cap height, which its digits share. */
  capHeight: number;
}

/**
 * How far to move digits down, in px, to centre them in their line. A line
 * is laid out around the font's ascent and descent together, but digits
 * stop at the baseline, so how high they ride depends on the font: a
 * pixel or two at 16px in Linux's fallback, next to nothing in some others.
 * Exact, not rounded, and kept within 4px, so odd metrics can't eat a
 * box's padding; a layout that reports nothing (no cap height) gives 0.
 */
export function digitNudge({ height, baseline, capHeight }: LineMetrics): number {
  if (!(capHeight > 0)) return 0;
  const nudge = height / 2 - (baseline - capHeight / 2);
  return Math.max(-4, Math.min(4, nudge));
}
