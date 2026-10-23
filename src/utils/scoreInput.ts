// What the score pads' number boxes hold: the text as typed, so an empty
// box or a lone "-" survives while someone is mid-entry, read as a number
// through num().

export function num(text: string): number {
  const n = parseInt(text, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Typed text to stored text: drops leading zeros ("07" -> "7"), allows a
 * sign only where `allowNeg`, floors anything else at 0, and caps it at
 * `max`. A number input reports a half-typed "-" as "", so that arrives
 * here as empty and the browser keeps showing the minus until the digit
 * follows.
 */
export function cleanInput(text: string, allowNeg: boolean, max = Infinity): string {
  const n = parseInt(text, 10);
  if (isNaN(n)) return '';
  return String(Math.min(max, allowNeg ? n : Math.max(0, n)));
}

/** Whether saved text is what a box could hold: digits, maybe after a minus, or nothing. */
export function isBoxText(v: unknown): v is string {
  return typeof v === 'string' && /^-?\d*$/.test(v);
}
