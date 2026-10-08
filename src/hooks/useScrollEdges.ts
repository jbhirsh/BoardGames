import { useCallback, useEffect, useState } from 'react';

export interface ScrollEdges {
  /** More to scroll back to, before the visible part. */
  start: boolean;
  /** More to scroll on to, past the visible part. */
  end: boolean;
}

const NONE: ScrollEdges = { start: false, end: false };

/**
 * Which ends of a sideways-scrolling strip have more hidden past them, so
 * the strip can fade there and show that it scrolls. Pass the returned
 * callback as the strip's ref; it follows scrolling and resizing.
 */
export function useScrollEdges(): [ScrollEdges, (el: HTMLElement | null) => void, HTMLElement | null] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [edges, setEdges] = useState<ScrollEdges>(NONE);

  useEffect(() => {
    if (!el) return;
    const measure = () => {
      // A pixel of slack: zoom can leave scrollLeft a fraction short of the end.
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, [el]);

  const ref = useCallback((node: HTMLElement | null) => setEl(node), []);
  return [edges, ref, el];
}
