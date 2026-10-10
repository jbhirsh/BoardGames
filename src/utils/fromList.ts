/**
 * Router state a home-page link carries into a sub-page. It marks the
 * history entry before that page as the list, so the page's Back link can
 * return to it as it was left (see BackLink).
 */
export const FROM_LIST = { fromList: true } as const;

/** Whether a page was reached from the list, given its location's state. */
export function cameFromList(state: unknown): boolean {
  return (state as { fromList?: unknown } | null)?.fromList === true;
}
