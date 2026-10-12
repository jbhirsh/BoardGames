/**
 * The list's open row, kept in the list page's own history entry (its
 * router state) rather than in React state alone: a row's Rules, Score and
 * Word Checker leave the page, and Back remounts it, so the row has to be
 * read back from the entry it was opened on. Per entry, so it survives Back
 * but never reaches a shared link or a fresh visit.
 */
type HistoryState = Record<string, unknown>;

/** The open row recorded in a location's state, or null. */
export function openRowFrom(state: unknown): string | null {
  const row = (state as HistoryState | null)?.openRow;
  return typeof row === 'string' ? row : null;
}

/** A location's state with its open row set to `row` (dropped for null), the rest kept. */
export function withOpenRow(state: unknown, row: string | null): HistoryState {
  const next: HistoryState = { ...(state as HistoryState | null) };
  if (row === null) delete next.openRow;
  else next.openRow = row;
  return next;
}
