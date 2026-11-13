import { useCallback, useLayoutEffect, useState } from 'react';

/**
 * Whether an element's content box is at most `max` px wide, followed as it
 * resizes. For content that differs by width: a CSS container query would
 * keep both versions in the page, where screen readers, and axe without a
 * stylesheet, read them both; this renders just the one that fits. (The
 * `hidden` attribute can't do it either: Tailwind's preflight holds
 * `[hidden]` to `display: none !important`, past any utility.) Pass the
 * returned callback as the element's ref.
 *
 * The width is read in a layout effect, so the first paint already fits.
 * Until there is layout (and in jsdom, which does none) it reads 0, which
 * counts as wide: an element with no width shows nothing either way.
 */
export function useNarrow(max: number): [boolean, (el: HTMLElement | null) => void] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [narrow, setNarrow] = useState(false);

  useLayoutEffect(() => {
    if (!el) return;
    const fit = (width: number) => setNarrow(width > 0 && width <= max);
    const style = getComputedStyle(el);
    fit(el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0));
    const ro = new ResizeObserver(([entry]) => fit(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, max]);

  const ref = useCallback((node: HTMLElement | null) => setEl(node), []);
  return [narrow, ref];
}
