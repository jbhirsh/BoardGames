/**
 * Class lists more than one component wears: a look that recurs, kept in one
 * place so it can't drift. Each is a complete set of utilities; a component
 * adds only what's its own (a size, a margin), never a class one of these
 * already sets.
 */

/**
 * A 44px touch target that costs no room, on a phone: the control keeps its
 * size and takes taps out to 44px each way through an invisible ::after
 * centred on it (no further where it's already bigger), so a fingertip that
 * lands beside a 32px button still presses it. A text field can't carry
 * one: the search keeps its 36px, the height of iOS's own search field.
 * e2e/phone.spec.ts probes the controls for it.
 */
export const tapTargetClass =
  "max-sm:relative max-sm:after:absolute max-sm:after:inset-[min(0px,calc(50%-22px))] max-sm:after:content-['']";

/**
 * The strong blue button (Pick for us, Suggest a game, the not-found page's
 * way home), which lifts a pixel under a mouse. Its size is the caller's:
 * pickHeaderClass on a section's heading, phoneActionClass in the phone's bar.
 */
export const pickButtonClass =
  'inline-flex shrink-0 cursor-pointer items-center bg-blue-fill font-semibold whitespace-nowrap text-on-fill [transition:background_0.15s,transform_0.15s,opacity_0.15s] disabled:cursor-not-allowed disabled:opacity-[0.45] can-hover:hover:not-disabled:transform-[translateY(-1px)] can-hover:hover:not-disabled:bg-blue-fill-hover';
/** The blue button's size on a section's heading line. */
export const pickHeaderClass = 'h-8.5 gap-1.5 rounded-control px-3.5 text-[13px]';
/**
 * The blue button's size in the middle of the phone's bar, where a thumb
 * rests; on the narrowest phones it drops its icon.
 */
export const phoneActionClass =
  'h-12 gap-2 rounded-[14px] px-5 text-[15px] shadow-(--shadow-phone-action) max-xs:px-3.5 max-xs:text-[14px] max-xs:[&_svg]:hidden';

/**
 * A phone heading's quiet icon button (ViewFlip, the wishlist's Share):
 * 34px, taps reaching 44px, the glyph alone until a copy says "Copied"
 * beside its tick.
 */
export const iconButtonClass = `inline-flex h-8.5 min-w-8.5 cursor-pointer items-center justify-center gap-1 rounded-xl px-2.5 text-[13px] font-semibold text-text2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue [&_svg]:size-5 ${tapTargetClass}`;

/** A section's heading line: the title and its count, then its controls at the end. */
export const sectionHeadClass = 'sec-hd mb-4 flex flex-wrap items-center justify-end gap-2.5 sm:mb-7 sm:gap-3.5';
/** The title and count at the start of a section's heading line, sharing a baseline. */
export const sectionNameClass = 'mr-auto flex min-w-0 items-baseline gap-2.5';
/** A section's title. */
export const sectionTitleClass =
  'font-display text-[22px] leading-[1.15] font-bold tracking-[-0.5px] text-dark sm:text-[26px]';
/** How many games a section holds, beside its title. */
export const sectionCountClass = 'text-[11px] tracking-[1.5px] whitespace-nowrap text-text3 uppercase';
/** The switches at the end of a section's heading line. */
export const sectionSwitchClass = '-mr-2.5 flex items-center gap-1 sm:mr-0 sm:gap-2.5';

/**
 * A group's heading over its cards (a sort's group, Coming Soon), ruled off
 * to the right; with the `group-hd` hook the tests find.
 */
export const groupHeadingClass =
  "group-hd mt-3 flex items-center gap-3.5 pt-5 pb-3 text-[11px] font-semibold tracking-[2px] text-text3 uppercase after:h-px after:flex-1 after:bg-border after:content-[''] first:mt-0 first:pt-1";

/** The cards' grid: as many 290px columns as fit, stretched to the row. */
export const cardGridClass = 'grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4';
