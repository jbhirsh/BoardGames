/**
 * Loose game-name key for duplicate checks: case-insensitive, punctuation
 * and extra whitespace ignored. Mirrors `normalize` in api/suggestions.ts.
 */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
