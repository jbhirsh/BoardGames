import { useEffect, type RefObject } from 'react';

export function useStickyOffset(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      document.documentElement.style.setProperty('--thead-top', `${h}px`);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}
