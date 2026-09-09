import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Award } from '../data/types';

function countLabel(awards: Award[]) {
  const n = awards.length;
  return `${n} ${n === 1 ? 'award' : 'awards'}`;
}

/** The list of wins, one per line with the year. */
export function AwardsList({ awards }: { awards: Award[] }) {
  return (
    <ul className="awards-list">
      {awards.map((a) => (
        <li key={`${a.name}-${a.year}`}>{a.name} <span className="awards-year">{a.year}</span></li>
      ))}
    </ul>
  );
}

function Trophy({ count }: { count: number }) {
  return (
    <>
      <span className="awards-trophy" aria-hidden="true">🏆</span>
      <span className="awards-n">{count}</span>
    </>
  );
}

/**
 * Non-interactive gold trophy pill with the count; nothing at all with no
 * wins. The wording lives in visually hidden text, since aria-label means
 * nothing on a plain span.
 */
export function AwardsCount({ awards }: { awards: Award[] }) {
  if (awards.length === 0) return null;
  return (
    <span className="awards awards-pill">
      <span aria-hidden="true"><Trophy count={awards.length} /></span>
      <span className="sr-only">{countLabel(awards)}</span>
    </span>
  );
}

interface Props {
  itemName: string;
  awards: Award[];
}

/**
 * Clickable award count. Opens the list of wins in a popover that floats
 * over the page (hover on a pointer, tap on touch), so revealing it never
 * shifts the card. The button carries the disclosure semantics
 * (aria-expanded and aria-controls) and the panel is a labelled group, not
 * a tooltip: a tooltip is hover-only supplementary text, and this one stays
 * pinned after a click. Renders nothing for an entry with no wins.
 */
export default function AwardsBadge({ itemName, awards }: Props) {
  if (awards.length === 0) return null;
  return <AwardsPopover itemName={itemName} awards={awards} />;
}

const POP_WIDTH = 260;
const GAP = 6;

function AwardsPopover({ itemName, awards }: Props) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const open = pinned || hover;

  // Rendered on the body with fixed positioning measured from the pill, so
  // neither a card's overflow clip nor its hover transform (which would make
  // the card the containing block) can cut the list off, and nothing below
  // the pill moves.
  // It sits below the pill unless that would run off the bottom of the
  // viewport and there is room above; scrolling closes it, so a panel that
  // opened out of view could never be reached.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = Math.min(POP_WIDTH, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const height = popRef.current?.offsetHeight ?? 0;
    const below = r.bottom + GAP;
    const above = r.top - GAP - height;
    const top = below + height > window.innerHeight - 8 && above >= 8 ? above : below;
    setPos({ position: 'fixed', top, left, width });
  }, [open]);

  // The list is anchored to where the pill was; once the page moves, or the
  // user clicks elsewhere or presses Escape, it goes away.
  useEffect(() => {
    if (!open) return;
    const close = () => { setPinned(false); setHover(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !popRef.current?.contains(t)) close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const label = countLabel(awards);
  return (
    <span className="awards" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`awards-pill awards-toggle${open ? ' open' : ''}`}
        aria-label={`${itemName}: ${label}, show which`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        // A tap fires mouseenter before click and never mouseleave, so the
        // click owns the state from then on: hover must not keep it open.
        onClick={(e) => { e.stopPropagation(); setHover(false); setPinned((p) => !p); }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <Trophy count={awards.length} />
      </button>
      {open && createPortal(
        <div id={id} ref={popRef} className="awards-pop" role="group" aria-labelledby={`${id}-title`} style={pos}>
          <div id={`${id}-title`} className="awards-pop-title">{itemName}: {label}</div>
          <AwardsList awards={awards} />
        </div>,
        document.body,
      )}
    </span>
  );
}
