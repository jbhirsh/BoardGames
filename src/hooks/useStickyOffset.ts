import { useEffect, type RefObject } from 'react';

/**
 * Publishes the sticky header's height as `--thead-top` so the table's sticky
 * `<thead>` parks directly beneath it.
 *
 * Must measure the *border* box: `contentRect` excludes the filter bar's
 * padding and bottom border, which left the offset ~17px short and hid the
 * column headers behind the bar. Observe the whole sticky wrapper rather than
 * the filter bar alone so the active-tag row counts when it appears.
 */
export function useStickyOffset(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      const height =
        entry.borderBoxSize?.[0]?.blockSize ??
        entry.target.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--thead-top', `${height}px`);
    });

    ro.observe(el, { box: 'border-box' });
    return () => ro.disconnect();
  }, [ref]);
}
