import { tapTargetClass } from './sharedClasses';

/**
 * The owner's sign-in page (SignInPage) and the pages the owner's emails
 * link to (EmailedLinkPage and the pages in it): one panel holding a line
 * of status, a field and its buttons. A button's or field's height is the
 * caller's: 40px on the sign-in form, 44px (a thumb's) on an emailed page.
 */

/** The panel, 440px at most. */
export const signInPanelClass = 'max-w-110 rounded-panel border border-border bg-surface p-6 shadow-(--shadow-md)';
/** A line saying what's happening, holding its line's height while empty. */
export const signInStatusClass = 'min-h-[1.5em] text-[13px] leading-normal text-text2';
/** A field's label. */
export const signInLabelClass = 'text-[12px] font-medium text-text2';
/** A text field, 16px so iOS doesn't zoom it. */
export const signInInputClass =
  'rounded-control border border-border2 bg-bg px-3.5 text-[16px] text-text outline-none [transition:border-color_0.15s,box-shadow_0.15s] focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-bg2)]';
/** A button's shape; its colours are signInPrimaryClass, signInGhostClass or the caller's. */
export const signInButtonClass = `cursor-pointer rounded-control px-4.5 text-[14px] font-semibold [transition:background_0.15s] disabled:cursor-wait disabled:opacity-60 ${tapTargetClass}`;
/** The filled button. */
export const signInPrimaryClass = 'bg-blue-fill text-on-fill hover:not-disabled:bg-blue-fill-hover';
/** The plain button beside it. */
export const signInGhostClass = 'border border-border2 bg-surface text-text hover:not-disabled:bg-bg2';
/** The row of buttons. */
export const signInActionsClass = 'flex flex-wrap items-center gap-2.5';
