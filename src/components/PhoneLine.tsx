import { useId, type ReactNode } from 'react';
import { ChevronIcon } from './Icons';

interface Props {
  /** The anchor a hero cover leads to. */
  id: string;
  img?: string;
  name: string;
  /** h4 under a group heading, h3 in a flat list, so heading levels never skip. */
  headingLevel: 3 | 4;
  /** Players, time and the like, one short line under the name. */
  meta: ReactNode;
  /** A button beside the chevron: a wishlist entry's vote. */
  action?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  /** What opening the line shows. */
  children: ReactNode;
  /** Data attributes for tests and the vote code to find an entry by. */
  data?: Record<`data-${string}`, string>;
}

/**
 * One game on a phone's list (PhoneListView, and the wishlist's): its box
 * art, its name over a short line of players and time, a wishlist entry's
 * vote, and a chevron, in a 72px row (more where a long name wraps), so ten fit on a
 * screen where three cards did.
 * A tap anywhere on the row but the vote opens it to show the rest, as a
 * desktop table's row does: the chevron is the one button that does it,
 * its tap area stretched over the row (an ::after over the line) with the vote raised
 * above it, so a screen reader or keyboard meets one control, named for the
 * game, where a jump to the game hands focus.
 * Closed, the rest is inert: nothing in it takes focus or is read out.
 */
// The box art, or the matte where there is none: smaller on the narrowest phones.
const artClass = 'block size-13 shrink-0 rounded-control border border-border object-contain max-xs:size-11';

export default function PhoneLine({
  id,
  img,
  name,
  headingLevel,
  meta,
  action,
  isOpen,
  onToggle,
  children,
  data,
}: Props) {
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  const detailId = useId();
  return (
    <li
      id={id}
      className={`line group/line scroll-mt-[calc(var(--thead-top,91px)+16px)] border-border [&+&]:border-t ${isOpen ? 'open' : ''}`}
      {...data}
    >
      <div className="relative flex min-h-18 items-center gap-3 py-2.5 pr-1 pl-3 group-[.jump-arrive]/line:animate-row-arrive max-xs:gap-2 max-xs:pl-2.5">
        {img ? (
          <img className={`line-art ${artClass} bg-art-matte filter-(--art-dim)`} src={img} alt="" loading="lazy" />
        ) : (
          <span className={`line-art line-art--none ${artClass} bg-bg2`} aria-hidden="true" />
        )}
        {/* A container, so a narrow line can drop the word "players". */}
        <div className="@container min-w-0 flex-1">
          <Heading className="font-display text-[16px] leading-tight font-bold tracking-[-0.2px] wrap-anywhere text-dark">
            {name}
          </Heading>
          <p className="line-meta mt-0.75 text-[12.5px] leading-[1.35] text-text2">{meta}</p>
        </div>
        {action}
        <button
          type="button"
          className="row-toggle line-toggle inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md align-middle after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
          data-focus-target="item"
          aria-expanded={isOpen}
          aria-controls={detailId}
          aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${name}`}
          onClick={onToggle}
        >
          <ChevronIcon open={isOpen} />
        </button>
      </div>
      {/* It opens by growing its one grid row from nothing to its content's height,
          clipped (not hidden, which can be scrolled: a link revealed mid-growth
          would slide away under its tap as the box grew). */}
      <div
        className={`line-detail grid [transition:grid-template-rows_0.25s_cubic-bezier(0.16,1,0.3,1)] ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        id={detailId}
        inert={!isOpen}
      >
        <div className="min-h-0 overflow-clip">
          <div className="px-3.5 pt-0.5 pb-3.5">{children}</div>
        </div>
      </div>
    </li>
  );
}
