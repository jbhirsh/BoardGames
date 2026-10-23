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
  meta: string;
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
 * its tap area stretched over the row (App.css) with the vote raised
 * above it, so a screen reader or keyboard meets one control, named for the
 * game, where a jump to the game hands focus.
 * Closed, the rest is inert: nothing in it takes focus or is read out.
 */
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
    <li id={id} className={`line${isOpen ? ' open' : ''}`} {...data}>
      <div className="line-main">
        {img ? (
          <img className="line-art" src={img} alt="" loading="lazy" />
        ) : (
          <span className="line-art line-art--none" aria-hidden="true" />
        )}
        <div className="line-text">
          <Heading className="line-name">{name}</Heading>
          <p className="line-meta">{meta}</p>
        </div>
        {action}
        <button
          type="button"
          className="row-toggle line-toggle"
          data-focus-target="item"
          aria-expanded={isOpen}
          aria-controls={detailId}
          aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${name}`}
          onClick={onToggle}
        >
          <ChevronIcon />
        </button>
      </div>
      <div className="line-detail" id={detailId} inert={!isOpen}>
        <div className="line-detail-clip">
          <div className="line-detail-inner">{children}</div>
        </div>
      </div>
    </li>
  );
}
