/**
 * Display names friends type once for "I own this" and suggestions: letters,
 * digits, spaces and a little punctuation, 1–30 characters. Mirrors NAME_RE in
 * api/owners.ts (the two trees can't import each other); keep them identical.
 */
export const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,29}$/u;

export const NAME_HINT = 'Use 1–30 letters, numbers, spaces, or . \' -';

export function isValidDisplayName(name: string): boolean {
  return NAME_RE.test(name);
}
