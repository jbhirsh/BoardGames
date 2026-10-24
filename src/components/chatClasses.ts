import { tapTargetClass } from './sharedClasses';

/**
 * The rules assistant's panel (RulesChat) and the word checker (WordChecker),
 * which is built like it: a panel, a row with a text field and a button, and
 * what comes back. The field is 16px, a functional minimum rather than a
 * style choice: iOS Safari zooms the whole page when a focused field computes
 * below it, and doesn't zoom back.
 */

/** The panel; its height is the caller's. */
export const panelClass =
  'rules-chat-panel mb-5 flex flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-(--shadow-md)';
/** The row the field and its button share; its edge and padding are the caller's. */
export const fieldRowClass = 'flex gap-2 bg-bg';
/**
 * The text field. It may shrink below the width a field asks for by
 * default (min-w-0), so its button always fits beside it.
 */
export const fieldClass =
  'min-w-0 flex-1 rounded-control border border-border bg-surface px-3.5 py-2.5 text-[16px] leading-4.5 text-text outline-none [transition:border-color_0.15s] focus:border-blue disabled:opacity-60';
/** The field's button: Send, Check. */
export const sendClass =
  'cursor-pointer rounded-control bg-blue-fill px-4.5 py-2.5 text-[14px] font-semibold text-on-fill [transition:opacity_0.15s] hover:not-disabled:opacity-85 disabled:cursor-not-allowed disabled:opacity-50';
/** The word checker's Check, which takes a phone's 44px taps. */
export const checkClass = `${sendClass} ${tapTargetClass}`;
