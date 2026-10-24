/**
 * The hero's look, shared by the home page's Hero and the not-found page,
 * which is set like it. On a phone the title shares a line with the theme
 * picker (a two-column grid), with the subtitle and the covers under them;
 * wider, everything is centred, the hero growing taller on a desktop. A soft
 * blue glow falls from the top centre.
 */
export const heroClass =
  "relative overflow-hidden bg-[linear-gradient(180deg,var(--color-hero-top)_0%,var(--color-bg)_100%)] px-gutter pt-3.5 pb-4 text-left before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,var(--color-hero-glow)_0%,transparent_70%)] before:content-[''] max-sm:grid max-sm:grid-cols-[1fr_auto] max-sm:items-center max-sm:gap-x-3 sm:pt-4 sm:pb-10 sm:text-center xl:pt-24 xl:pb-20";

/** The hero's heading: beside the theme picker on a phone, then large and centred. */
export const heroTitleClass =
  'font-display text-[clamp(20px,(100vw-146px)/8,30px)] leading-none font-black tracking-[-0.022em] text-dark max-sm:col-1 max-sm:row-1 sm:mb-3 sm:text-[clamp(34px,7vw,80px)]';

/** The line under the hero's heading. */
export const heroSubClass =
  'mt-2 text-[14px] leading-normal font-normal text-text2 max-sm:col-span-full sm:mx-auto sm:mt-0 sm:mb-6 sm:max-w-110 sm:text-[17px]';
