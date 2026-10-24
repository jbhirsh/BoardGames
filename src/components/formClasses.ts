import { tapTargetClass } from './sharedClasses';

/**
 * The wishlist's forms (Suggest a game, and the owner's add and edit forms
 * in AdminPanel and AdminItemControls): labels beside their fields, stacked
 * on a phone, and one action row under them. The owner's small buttons and
 * muted lines are here too.
 */

/**
 * Labels and fields in two columns, one on a phone. In one column each
 * label sits 6px over its field and 16px under the field before, so it
 * reads as that field's, not the one above's.
 */
export const fieldsClass =
  'grid max-w-130 grid-cols-[1fr] items-center gap-x-3.5 gap-y-1.5 sm:grid-cols-[max-content_1fr] sm:gap-y-2.5 max-sm:[&>label:not(:first-child)]:mt-2.5';
/** A field's label. */
export const fieldLabelClass = 'text-[12px] font-medium text-text2';
/** "(optional)" after a label. */
export const optionalClass = 'font-normal text-text3';
/**
 * A text field, 16px so iOS doesn't zoom it. Its height is the caller's:
 * h-8.5 for a line, h-auto and py-2 for a text area.
 */
export const fieldClass =
  'min-w-0 rounded-lg border border-border2 bg-bg px-3 text-[16px] text-text placeholder:text-text3 placeholder:opacity-100 focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-bg2)] focus:outline-none';
/** The row of actions under a form's fields. */
export const formActionsClass = 'mt-4 flex flex-wrap items-center gap-3';
/** A form's submit button, which waits (dimmed) while sending. */
export const submitClass = `h-8.5 cursor-pointer rounded-lg border border-blue-fill bg-blue-fill px-4 text-[13px] font-semibold text-on-fill [transition:background_0.15s] hover:not-disabled:bg-blue-fill-hover disabled:cursor-wait disabled:opacity-60 ${tapTargetClass}`;
/** What a form says after a submit. */
export const formStatusClass = 'text-[12.5px] text-text2';

const adminButtonBaseClass =
  'cursor-pointer rounded-lg border px-3 text-[12px] font-semibold [transition:background_0.15s,border-color_0.15s,color_0.15s] disabled:cursor-wait disabled:opacity-60';
const quietClass =
  'border-border2 bg-surface text-text2 hover:not-disabled:border-blue-tint/40 hover:not-disabled:text-blue';
/** The owner's buttons: Approve and Save filled, the rest quiet, Remove's confirmation in red. */
export const adminButtonClass = `${adminButtonBaseClass} h-7.5 border-blue-fill bg-blue-fill text-on-fill`;
export const adminGhostClass = `${adminButtonBaseClass} h-7.5 ${quietClass}`;
export const adminDangerClass = `${adminButtonBaseClass} h-7.5 border-danger-fill bg-danger-fill text-on-fill`;
/** A queued suggestion's Look up, as tall as the name field beside it. */
export const adminLookUpClass = `${adminButtonBaseClass} h-8.5 ${quietClass}`;
/** A row of the owner's buttons. */
export const adminActionsClass = 'flex flex-wrap items-center gap-2';
/** A quiet line or aside in the owner's tools. */
export const adminMutedClass = 'text-[12.5px] text-text2';
/** What went wrong, under the owner's form or row. */
export const adminErrorClass = 'mt-2 text-[12.5px] text-error-fg';
/** A heading inside the owner's tools. */
export const adminSubtitleClass = 'mt-4 mb-2.5 text-[11px] font-semibold tracking-[2px] text-text3 uppercase';
