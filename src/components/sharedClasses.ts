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

/**
 * The small pills that filter or list (keywords, the add-ons tag, the award
 * count, a row's duration) answer to an area 3px taller and 2px wider than
 * they look, at every width (WCAG 2.5.8's 24px), as far as the gap between
 * rows allows.
 */
export const pillTapClass = "relative after:absolute after:-inset-x-0.5 after:-inset-y-0.75 after:content-['']";

/** Players, time or difficulty beside its icon, on a card or an add-on's row. */
export const metaClass = 'cmeta flex items-center gap-1 text-[12px] text-text3 [&_svg]:shrink-0';

/** A quiet label pill: an expansion's base game, or when a game on its way is due. Its corners are the caller's. */
export const labelPillClass =
  'inline-block border border-border bg-bg2 px-2 py-px text-[11.5px] leading-normal font-semibold text-text2';

/**
 * A card in the grid (a collection game's, a wishlist entry's). It spans four
 * rows of the grid and shares them with the cards beside it (subgrid), so
 * heads, descriptions and footers line up across a row whatever wraps inside
 * them; the last row is the add-ons panel under the footer's button, empty
 * until a card opens it. It lifts under a mouse, and while keyboard focus is
 * inside it (:has(:focus-visible) rather than :focus-within, which a tap on
 * a card's button would also match). No scale(): it resampled the card's
 * text and left it soft. A cover's jump rings it (jump-arrive).
 */
export const cardClass =
  'group/card row-span-4 grid scroll-mt-[calc(var(--thead-top,91px)+16px)] grid-rows-subgrid gap-y-0 overflow-hidden rounded-panel border border-border bg-surface shadow-(--shadow-sm) [transition:transform_0.25s_cubic-bezier(0.16,1,0.3,1),box-shadow_0.25s_cubic-bezier(0.16,1,0.3,1),border-color_0.2s] has-focus-visible:transform-[translateY(-3px)] has-focus-visible:border-border-hover has-focus-visible:shadow-(--shadow-lg) can-hover:hover:transform-[translateY(-3px)] can-hover:hover:border-border-hover can-hover:hover:shadow-(--shadow-lg) [&.jump-arrive]:animate-card-arrive';
/**
 * A card's head: the name, meta and tags, the box art in its corner.
 * --corner-art sizes the art, and --corner-clear is the text's right padding
 * that keeps clear of it: the art sits 14px in from the edge and the text
 * 18px, so the art plus 10px leaves 14px between them.
 */
export const cardHeadClass =
  'card-head relative row-1 border-b border-border px-4.5 pt-4 pb-3 [--corner-art:76px] [--corner-clear:calc(var(--corner-art)+10px)]';
/** The box art in a card's corner, its edge tinting blue while the card lifts. */
export const cornerArtClass =
  'card-corner-img absolute top-3 right-3.5 size-(--corner-art) shrink-0 rounded-[14px] border border-border bg-art-matte object-contain shadow-(--shadow-sm) filter-(--art-dim) group-has-focus-visible/card:border-blue-tint/25 can-hover:group-hover/card:border-blue-tint/25';
/** A card's name. */
export const cardNameClass = 'card-name mb-2 font-display text-[16px] leading-[1.2] font-bold text-dark';
/** A card's players, time and difficulty. */
export const cardMetaClass = 'flex flex-wrap gap-x-3 gap-y-1';
/** A card's tags, under its meta (pt-2 and the corner's clearance on a card; mb-3.5 in an open line). */
export const tagsClass = 'card-kw flex flex-wrap items-start gap-1';
/** A card's body: its description, and what More opens. */
export const cardBodyClass = 'row-2 px-4.5 pt-3 pb-4';
/** A card's description. */
export const cardDescClass = 'card-desc text-[13px] leading-[1.68] text-text2';
/** The More or Less link that closes a card's description. */
export const cardMoreClass =
  'inline cursor-pointer font-semibold whitespace-nowrap text-blue hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue';
/** Who suggested a wishlist entry (mt-2 on a card, mb-2.5 in an open line). */
export const creditClass = 'card-credit text-[12px] text-text3';
/**
 * A card's footer: what the card holds besides its own game bottom left, the
 * actions bottom right; on a card too narrow for both, the actions drop to
 * their own line together. A container, so a narrow card can shorten its
 * add-ons button.
 */
export const cardFootClass = 'card-foot @container row-3 flex flex-wrap items-center gap-2 self-end px-4.5 pb-4';
/** The start of a card's footer, gone when it holds nothing. */
export const cardFootStartClass = 'card-foot-start flex items-center gap-1.5 empty:hidden';
/** The end of a card's footer: its actions. */
export const cardFootEndClass = 'card-foot-end ml-auto flex items-center gap-1.5 sm:gap-2';
/** The foot of an open list row or phone line: its actions, ruled off on the right. */
export const rowFootClass =
  'row-expand-foot relative z-1 mt-1 flex items-center justify-end gap-2 border-t border-border px-1 pt-3 pb-1';

/** A section of an open card, row or line: a heading over its paragraph. */
export const detailSectionClass = 'detail-section mb-4.5';
/** A detail section's heading. */
export const detailHeadingClass = 'mb-1.5 font-display text-[13px] font-bold tracking-[-0.2px] text-dark';
/** A detail section's heading in an add-on's More, a size down. */
export const smallDetailHeadingClass = 'mb-0.75 font-display text-[12px] font-bold tracking-[-0.2px] text-dark';
/** A detail section's paragraph. */
export const detailTextClass = 'text-[13px] leading-[1.75] text-text2';
/** A detail section's paragraph in an add-on's More, a size down. */
export const smallDetailTextClass = 'text-[12px] leading-[1.6] text-text2';

/**
 * The quiet outlined icon buttons beside Rules and the vote: the video, the
 * cart and the price history, one size and radius, taking 44px taps on a
 * phone.
 */
export const outlineIconClass = `inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text2 [transition:background_0.15s,color_0.15s,border-color_0.15s,transform_0.15s] ${tapTargetClass}`;
/** The video button's play glyph, in YouTube's red, and its lift under a mouse. */
export const videoButtonClass = `${outlineIconClass} can-hover:hover:transform-[scale(1.05)] can-hover:hover:border-border-hover can-hover:hover:bg-bg2 [&_svg]:block [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:fill-yt-red`;

/** A phone's list (PhoneListView, the wishlist's): a line a game, in one rounded panel. */
export const linesClass = 'lines overflow-hidden rounded-panel border border-border bg-surface shadow-(--shadow-sm)';

/** A wishlist group (and its heading), spaced from the one before it. */
export const wishGroupClass = '[&+&]:mt-3';

/** An add-on's kind (expansion, extension, version) beside its name, on its row or its rulebook's tab. */
export const kindChipClass =
  'rounded-[5px] px-1.5 py-0.5 text-[9.5px] leading-[1.3] font-bold tracking-[0.6px] whitespace-nowrap uppercase';
/** A kind chip's colours: an expansion's amber, an extension's green, a version's blue. */
export const kindClasses: Readonly<Record<string, string>> = {
  expansion: 'bg-expansion-tint/12 text-expansion-fg',
  extension: 'bg-extension-tint/12 text-extension-fg',
  version: 'bg-blue-tint/10 text-version-fg',
};

/**
 * A page of its own (a game's rules, a score pad, the word checker,
 * sign-in): one 960px column, whose side padding follows the gutter on a
 * phone but stops at 24px, as a 48px gutter would eat content width for
 * nothing in a column this narrow.
 */
export const pageClass = 'rules-page mx-auto max-w-240 px-[min(var(--spacing-gutter),24px)] pt-8 pb-16';
/** A page's header: Back, then the title. */
export const pageHeaderClass = 'rules-header mb-8';
/**
 * A page's title: one line, cut short with an ellipsis, beside the box art;
 * on a phone it wraps under nothing and nothing is cut.
 */
export const pageTitleClass =
  'rules-game-name mb-1.5 font-display text-[22px] leading-[1.2] font-bold text-dark sm:mb-1 sm:truncate sm:text-[clamp(24px,4vw,36px)]';
/** The line under a page's title. */
export const pageDescClass = 'rules-game-desc text-[14px] leading-normal text-text2';
/**
 * A button beside a page's title (the rules assistant, the score pad, the
 * word checker): its colours are the caller's (headerButtonLiveClass, or a
 * loading page's grey). On a phone two share a row where they fit, else each
 * takes the row, a label never wrapping inside its button.
 */
export const headerButtonClass = `rules-chat-toggle inline-flex shrink-0 items-center gap-2 rounded-control border py-2.5 text-[14px] leading-4 font-semibold [transition:background_0.15s,border-color_0.15s] max-sm:flex-[1_1_calc(50%-7px)] max-sm:justify-center max-sm:px-3 max-sm:whitespace-nowrap sm:px-5 ${tapTargetClass}`;
/** A header button's blue. */
export const headerButtonLiveClass =
  'cursor-pointer border-blue-tint/20 bg-blue-bg text-blue hover:border-blue-tint/35 hover:bg-blue-tint/12';

/** A rulebook's quiet line: loading, or why it can't be shown. */
export const pdfNoteClass = 'py-6 text-center text-[14px] text-text2';

/**
 * On a phone the rules page's links keep one line, from the first paint and
 * whatever Save for offline says, in fewer words: Download, Open, Save
 * offline (Saving…, Saved, No space, Try again). Words dropped from sight
 * (rules-more) are still read out; rules-short stands in for them on
 * screen; rules-wide goes altogether. Worn by what holds them.
 */
export const fewerWordsClass =
  'max-md:[&_.rules-more]:sr-only [&_.rules-short]:hidden max-md:[&_.rules-short]:inline max-md:[&_.rules-wide]:hidden';
/** The rules page's links above the reader (Download, Open, Save for offline). */
export const rulesLinkClass = `rules-download inline-flex items-center gap-1.5 text-[13px] font-medium text-blue [transition:opacity_0.15s] hover:opacity-70 max-xs:gap-1.25 ${tapTargetClass}`;
