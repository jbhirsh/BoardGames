import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** Class on the wrapper around the button. */
  className: string;
  /** Classes on the button itself; `open` is added while the panel shows. */
  buttonClassName: string;
  /** What the button says to a screen reader. */
  label: string;
  /** The panel's heading. */
  title: string;
  /** What the button shows. */
  trigger: ReactNode;
  /** The panel's body. */
  children: ReactNode;
  /**
   * For a button that already does something on click (the card's add-ons
   * button opens its full list): the panel becomes a hover-only preview,
   * described by the button rather than pinned, and the click is this.
   */
  activate?: { onClick: () => void; expanded: boolean; controls: string };
}

const POP_WIDTH = 260;
const GAP = 6;

/**
 * A small button that opens a short list in a panel floating over the page
 * (hover on a pointer, tap on touch), so revealing it never shifts what is
 * around it. The button carries the disclosure semantics (aria-expanded and
 * aria-controls) and the panel is a labelled group, not a tooltip: a tooltip
 * is hover-only supplementary text, and this one stays pinned after a click.
 * Clicks on the button and in the panel stop there, so a table row behind
 * them doesn't toggle.
 */
export default function Popover({ className, buttonClassName, label, title, trigger, children, activate }: Props) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const id = useId();
  // A preview has nothing to add once the full list it previews is open.
  const open = pinned || (hover && !activate?.expanded);

  // Rendered on the body with fixed positioning measured from the button, so
  // neither a card's overflow clip nor its hover transform (which would make
  // the card the containing block) can cut the list off, and nothing below
  // the button moves.
  // It sits below the button unless that would run off the bottom of the
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

  // The list is anchored to where the button was; once the page moves, or
  // the user clicks elsewhere or presses Escape, it goes away.
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

  return (
    <span className={className} ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`${buttonClassName}${open ? ' open' : ''}`}
        aria-label={label}
        aria-expanded={activate ? activate.expanded : open}
        aria-controls={activate ? activate.controls : open ? id : undefined}
        aria-describedby={activate && open ? id : undefined}
        // A tap fires mouseenter before click and never mouseleave, so the
        // click owns the state from then on: hover must not keep it open.
        onClick={(e) => {
          e.stopPropagation();
          setHover(false);
          if (activate) activate.onClick();
          else setPinned((p) => !p);
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {trigger}
      </button>
      {open && createPortal(
        // React bubbles a click inside a portal up the component tree, not the
        // page, so one on the panel would still reach a table row behind it.
        // The wrapper only stops it; it means nothing to assistive tech.
        <div role="presentation" onClick={(e) => e.stopPropagation()}>
          <div
            id={id}
            ref={popRef}
            className="pop"
            role={activate ? 'tooltip' : 'group'}
            aria-labelledby={activate ? undefined : `${id}-title`}
            style={pos}
          >
            <div id={`${id}-title`} className="pop-title">{title}</div>
            {children}
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
