/**
 * The list view's table, shared by the collection's and the wishlist's
 * (ListView, WishlistListView): its frame, its sticky head and its cells.
 * Phone first: a phone's list keeps the name, duration and actions; 721px
 * brings back players and 901px the description and tags (the description
 * folds under the name until then), the difficulty waiting for 1081px.
 */

/** The table's frame: rounded corners that don't break the head's sticky position (clip-path, not overflow). */
export const tableWrapClass =
  'table-wrap rounded-panel border border-border shadow-(--shadow-sm) [clip-path:inset(0_round_var(--radius-panel))]';
/** The table. */
export const tableClass = 'games-list w-full table-auto border-collapse bg-surface';

/** A column header, pinned under the sticky filter bar (--thead-top, useStickyOffset). */
export const headCellClass =
  'sticky top-(--thead-top,91px) z-10 border-b border-border bg-bg2 px-3.5 py-2.5 text-left align-middle text-[10px] font-semibold tracking-[1.8px] whitespace-nowrap text-text3 uppercase first:pl-3.5 last:pr-3.5 sm:first:pl-5 sm:last:pr-5';

// A row's cell: tinted under a pointer, blue-tinted while the row is open,
// and tinted for a moment when a hero cover leads to the row (jump-arrive).
const cellBaseClass =
  'border-b border-border px-2.5 py-2.75 align-middle [transition:background_0.14s] group-last-of-type/row:border-b-0 group-[.jump-arrive]/row:animate-row-arrive first:pl-3.5 last:pr-3.5 sm:p-2.5 sm:first:pl-4 sm:last:pr-5 xl:px-3.5 xl:py-3 xl:first:pl-5';

/** A row's cell (its `tr` is a `group/row`), `open` while the row is. */
export function cellClass(open: boolean): string {
  return `${cellBaseClass} ${open ? 'bg-blue-tint/4' : 'group-hover/row:bg-row-hover'}`;
}

/** A game's name, in its cell and again inside it, over the folded description. */
export const nameClass = 'font-display text-[13.5px] leading-[1.2] font-bold text-balance text-dark xl:text-[15px]';
