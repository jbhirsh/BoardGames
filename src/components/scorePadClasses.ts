import { tapTargetClass } from './sharedClasses';

/**
 * What the score pads share (PlayerScorePad, RoundScorePad, ScoreInput and
 * the pads they hold): panels, rows of boxes, the table's own choices
 * (a map, a Kingdom), groups, choice buttons and the Results sheet.
 * Written for a phone first: every control is 44px or takes taps out to
 * 44px, and wider screens only add room. One spacing scale: 12px between
 * a form's rows and the pad's panels, 16px inside a panel on a phone
 * (20px wider), so every panel's content starts on one edge.
 */

const focusOutlineClass = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue';

/** A panel: a player's form, the standings, a round's entry, a sheet. */
export const panelClass =
  'overflow-hidden rounded-panel border border-border bg-surface p-4 shadow-(--shadow-md) sm:p-5';
/** The boxes in a panel, in a column. */
export const formClass = 'flex flex-col gap-3';
/** A row of a form: its label, then its box at the far end (which never shrinks). */
export const rowClass = 'flex items-center justify-between gap-3 [&>.sc-field]:flex-none';
/** A row's label: an icon or not, then its text. */
export const labelClass = 'flex items-center gap-2 text-[14px] font-medium text-text';
/**
 * A label's text and its muted notes. On a phone the notes are a quiet
 * second line under the name, so every row's name starts on one edge and
 * its notes on the next line, whatever their length; a wider screen has
 * them on the name's line, wrapping under it (in line with it) where the
 * row is too narrow.
 */
export const labelTextClass =
  'flex flex-wrap items-baseline gap-x-3 max-sm:flex-col max-sm:items-start max-sm:gap-y-0.5';
/** The notes on a label's second line: what one is worth, and what they come to. */
export const notesClass = 'flex flex-wrap items-baseline gap-x-3';
/** A muted note: what a row is worth, what a group comes to. */
export const noteClass = 'text-[12px] font-normal text-text3';
/** A muted note after a title's text, on its line. */
export const titleNoteClass = `${noteClass} ml-1`;
/** A muted note in a label's text, kept on one line. */
export const labelNoteClass = `${noteClass} whitespace-nowrap`;
/** A note's points, with room for two digits so a 9 going to 10 can't wrap it. */
export const pointsClass = 'inline-block min-w-[7ch]';
/** A box and the ± button before it. */
export const inputWrapClass = 'flex items-center gap-1.5';
/** A rule between a group and the next thing in the form. */
export const dividedClass = 'border-t border-border pt-3';

/** A box's frame: its category's colour (--box-color) or the plain border. */
const boxFrameClass =
  'rounded-control border-2 border-(--box-color,var(--color-border)) bg-bg [transition:border-color_0.15s,box-shadow_0.15s]';
const boxTextClass = 'text-[16px] text-text outline-none';
/** 16px so iOS doesn't zoom: a pad has ten of these in a column. */
const inputClass = `min-h-11 ${boxFrameClass} ${boxTextClass} focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-bg2)]`;
/** A name's box; the caller sets where its text sits and how wide it grows. */
export const nameInputClass = `${inputClass} w-20 flex-1 px-2.5 py-2`;
/**
 * A number box. No spin buttons: desktop browsers keep their width inside
 * the box (Chrome even while they're hidden), so centred numbers sat 7px
 * left of centre. Digits stop at the baseline, so they ride high in a box
 * centred on the font's whole line; the page measures the font and sets
 * the nudge (--digit-nudge, ScorePadFrame).
 */
const numberClass =
  '[appearance:textfield] pt-[calc(8px+var(--digit-nudge,0px))] pb-[calc(8px-var(--digit-nudge,0px))] text-center [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none';
/** A bare number box, without a unit; its width is the caller's. */
export const numberInputClass = `${inputClass} ${numberClass} px-2.5`;
/**
 * A score box with a unit is a wrapper drawn as the box, holding the
 * score's input sized to its text, a space and the unit: "7 coins" is one
 * line in the boxes' 16px, the unit muted, centred in the box as a group
 * and on the score's baseline. The input reaches across the whole box
 * (padding it gives back as negative margin, clipped by the box), so a
 * tap anywhere in the box lands in it; nothing else in the box takes
 * taps. 5.5em fits "99 coins" and "107 VP" with about 8px to spare a side
 * in the widest fallback font. Where the browser can't size the input to
 * its text, it is one ch per character (--chars; tabular digits are a ch
 * each).
 */
export const fieldClass = `sc-field pointer-events-none block w-[5.5em] overflow-hidden text-center text-[16px] leading-[normal] whitespace-nowrap ${boxFrameClass} focus-within:border-blue focus-within:shadow-[0_0_0_3px_var(--color-blue-bg2)]`;
/** The input inside a field (fieldClass). */
export const fieldInputClass = `${numberClass} ${boxTextClass} pointer-events-auto -mx-(--reach) min-h-10 w-[calc(var(--chars,1)*1ch+2*var(--reach))] px-(--reach) tabular-nums [--reach:6em] [transition:border-color_0.15s,box-shadow_0.15s] supports-[field-sizing:content]:field-sizing-content supports-[field-sizing:content]:w-auto`;

/** The player's total under their boxes. */
export const totalClass =
  'mt-1 flex items-center justify-between border-t-2 border-border pt-3 text-[16px] font-bold text-text';
/**
 * Hands the pad on (Next, See results), or adds a round; filled. At the
 * end of its row, and on a phone the form's whole width, in reach of
 * either thumb.
 */
export const nextClass = `cursor-pointer self-end rounded-control bg-blue-fill px-4.5 py-2.5 text-[14px] font-semibold text-on-fill hover:not-disabled:brightness-108 max-sm:w-full ${focusOutlineClass} ${tapTargetClass}`;
/**
 * The row under a pad holding New game. On a phone it ends the page apart
 * from the pad (24px clear of it), as wide as the panels, and clear of
 * the home indicator.
 */
export const actionsClass = 'mt-3 flex justify-end max-sm:mt-6 max-sm:pb-[env(safe-area-inset-bottom,0px)]';
/** New game, and a round's Delete and Cancel: quiet. */
export const quietButtonClass =
  'min-h-11 cursor-pointer rounded-control border border-border bg-bg2 px-4 py-2 text-[13px] font-semibold text-text2 hover:bg-bg3 hover:text-text';
/** New game, in actionsClass' row. */
export const newGameClass = `${quietButtonClass} max-sm:w-full`;

/** What the whole table shares, above the players: the map played, the Kingdom, the players' names. */
export const setupClass = 'mb-3 flex min-w-0 flex-col gap-3 rounded-panel border border-border bg-surface p-4';
const setupTitleBaseClass = 'flex flex-wrap gap-x-2.5 gap-y-1 text-[14px] font-semibold text-text';
/** The setup's heading. */
export const setupTitleClass = `${setupTitleBaseClass} items-baseline`;
/**
 * The setup's heading as the summary that folds it away (in a details with
 * group/setup), ending in the chevron House rules has, turned up while open.
 */
export const setupSummaryClass = `${setupTitleBaseClass} min-h-11 cursor-pointer list-none items-center after:ml-auto after:size-1.75 after:flex-none after:transform-[rotate(45deg)] after:border-r-2 after:border-b-2 after:border-text3 after:content-[''] after:[transition:transform_0.15s] group-open/setup:after:transform-[rotate(-135deg)] [&::-webkit-details-marker]:hidden`;
/** A line of help. */
export const hintClass = 'text-[13px] leading-normal text-text2';
/** A group of boxes (a fieldset), its legend groupTitleClass. */
export const groupClass = 'flex min-w-0 flex-col gap-3';
export const groupTitleClass = 'mb-2 text-[15px] font-bold text-text';

/** A row of choice buttons, one pressed at a time. */
export const segClass = 'flex flex-wrap gap-1.5';
const segButtonBaseClass = `min-h-11 min-w-11 cursor-pointer rounded-control border border-border bg-bg2 text-[14px] font-semibold text-text2 [transition:color_0.15s,background_0.15s,border-color_0.15s] aria-pressed:border-blue-tint/40 aria-pressed:bg-blue-bg aria-pressed:text-blue ${focusOutlineClass}`;
/** A choice button. */
export const segButtonClass = `${segButtonBaseClass} px-3.5`;
/** A choice button sharing its row out with the others (a ticket's Made and Missed). */
export const sharedSegButtonClass = `${segButtonBaseClass} flex-1 px-2`;
/** A 44px × that takes a row away. */
export const removeClass = `size-11 flex-none cursor-pointer rounded-control border border-border bg-transparent text-[20px] text-text2 ${focusOutlineClass}`;
/** + Add a row (a ticket, a player). */
export const addRowClass = `min-h-11 cursor-pointer self-start rounded-control border border-dashed border-blue-tint/45 bg-transparent px-4 text-[14px] font-semibold text-blue ${focusOutlineClass}`;
/** A checkbox row: the box, then its text and any note under it. */
export const checkClass =
  'flex min-h-11 cursor-pointer items-center gap-3 text-[14px] font-medium text-text [&>span]:flex [&>span]:flex-col';
/** A 22px checkbox in the pad's blue. */
export const checkboxClass = 'm-0 size-5.5 flex-none accent-blue-fill';

/** The Results sheet's scroller: the players' columns scroll sideways on a phone. */
export const sheetWrapClass = 'overflow-x-auto';
export const sheetClass = 'w-full border-separate border-spacing-0 text-[14px] tabular-nums';
const cellClass = 'px-3 py-2.25 whitespace-nowrap';
const ruledClass = 'border-b border-border';
/** The category column stays put while the players' columns scroll. */
const stickyClass = 'sticky left-0 z-1';
/** A player's name over their column. */
export const sheetHeadClass = `${cellClass} ${ruledClass} text-center align-bottom text-[13px] font-bold text-text`;
/** The empty cell over the category column. */
export const sheetCornerClass = `${sheetHeadClass} ${stickyClass} bg-surface`;
// A row heading's weight is the same in every row, the Total row's too.
const sheetRowHeadBaseClass = `${cellClass} ${stickyClass} text-left font-medium text-text`;
/** A category's heading, in the category column. */
export const sheetRowHeadClass = `${sheetRowHeadBaseClass} ${ruledClass} bg-surface`;
/** A row's heading, and its scores, while the round pad's form has that round open. */
export const sheetEditRowHeadClass = `${sheetRowHeadBaseClass} ${ruledClass} bg-blue-bg`;
/** A player's score in a category. */
export const sheetCellClass = `${cellClass} ${ruledClass} text-center text-text`;
export const sheetEditCellClass = `${sheetCellClass} bg-blue-bg`;
const totalRowClass = 'border-t-2 border-b border-border text-[16px]';
/** The Total row's heading, and each player's total in bold blue. */
export const sheetTotalHeadClass = `${sheetRowHeadBaseClass} ${totalRowClass} bg-surface`;
export const sheetTotalCellClass = `${cellClass} ${totalRowClass} text-center font-bold text-blue`;
/** The Place row's heading, and each player's place, muted. */
export const sheetPlaceHeadClass = `${sheetRowHeadBaseClass} bg-surface text-[13px]`;
export const sheetPlaceCellClass = `${cellClass} text-center text-[13px] text-text2`;
/** The winner's column, shaded. */
export const winClass = 'sc-win bg-win/10';
/** The more a cell holds, under its score: "7 coins", "2 bags". */
export const sheetSubClass = 'block text-[11px] text-text3';
/** How a tie was broken, under the sheet. */
export const tieNoteClass = 'mt-3 text-[13px] text-text';
/** The pad's rule, muted, at the foot. */
export const ruleClass = 'text-[12px] text-text3';
