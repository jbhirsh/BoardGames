/**
 * The filter bar's pills (a dropdown's button, and the phone's Filters
 * button): a white capsule on a hairline that takes the blue tint once its
 * filter is on and wears a blue ring while its panel is open. Smaller on a
 * phone.
 */
const pillBaseClass =
  'inline-flex h-8 cursor-pointer items-center gap-1.75 rounded-[20px] border px-2.75 text-[12px] whitespace-nowrap select-none [transition:border-color_0.18s,color_0.18s,box-shadow_0.18s] sm:h-8.5 sm:px-3.5 sm:text-[13px]';
const pillOnClass = 'border-blue-tint/40 bg-blue-bg font-medium text-blue';
const pillOpenClass = 'border-blue bg-surface font-normal text-dark';
const pillOffClass = 'border-border2 bg-surface font-normal text-text2 hover:border-border-hover hover:text-text';
const ringClass = 'shadow-[0_0_0_3px_var(--color-blue-bg2)]';
const shadowClass = 'shadow-(--shadow-sm)';

/** A pill's classes: `on` while its filter is set (with the `active` hook), `open` while its panel shows. */
export function pillClass(on: boolean, open: boolean): string {
  return `${pillBaseClass} ${on ? `active ${pillOnClass}` : open ? pillOpenClass : pillOffClass} ${open ? ringClass : shadowClass}`;
}
