/**
 * A dropdown's options (RadioOptions, the keywords list): a row each in a
 * dropdown's panel, a capsule chip each in the phone's filter sheet, tinted
 * blue while chosen. The mark is a box with a tick for the keywords, round
 * with a dot for a single choice.
 */
const optionBaseClass =
  'dd-opt flex cursor-pointer items-center gap-2.25 text-left text-[13px] select-none [transition:background_0.12s,color_0.12s]';
const optionListClass = 'w-full rounded-lg px-2.5 py-2';
const optionChipClass = 'w-auto rounded-[20px] border px-3 py-1.75';

/** An option's classes, with the `dd-opt` hook (and `sel` while chosen). */
export function optionClass(chosen: boolean, chips: boolean): string {
  const shape = chips ? `${optionChipClass} ${chosen ? 'border-blue-tint/35' : 'border-border'}` : optionListClass;
  return `${optionBaseClass} ${shape} ${chosen ? 'sel bg-blue-bg font-medium text-blue' : 'text-text2 hover:bg-bg2 hover:text-text'}`;
}

/** The mark before an option's name (rounded-sm for a box, round for a single choice). */
export const markClass =
  'flex size-3.75 shrink-0 items-center justify-center border-[1.5px] [transition:background_0.13s,border-color_0.13s]';
export const markOffClass = 'border-border2';
export const markOnClass =
  'border-blue-fill bg-blue-fill [&_svg]:size-2.25 [&_svg]:fill-none [&_svg]:stroke-on-fill [&_svg]:[transition:opacity_0.13s]';
/** The chosen single choice's dot. */
export const dotClass = "after:size-1.25 after:rounded-[50%] after:bg-on-fill after:content-['']";
