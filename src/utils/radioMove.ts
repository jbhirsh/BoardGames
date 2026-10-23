// Arrow-key movement in a radio group (the dropdowns' RadioOptions, the
// theme toggle): the arrows step to the next or previous option, wrapping
// at either end, and Home and End go to the first and last.

const MOVES: Record<string, (i: number, n: number) => number> = {
  ArrowDown: (i, n) => (i + 1) % n,
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowUp: (i, n) => (i - 1 + n) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

/** The option `key` moves to from option `from` of `count`, or null for a key that doesn't move. */
export function radioMove(key: string, from: number, count: number): number | null {
  return Object.hasOwn(MOVES, key) ? MOVES[key](from, count) : null;
}
