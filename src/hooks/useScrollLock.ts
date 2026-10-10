import { useEffect } from 'react';

/**
 * Holds the page still under a modal: the body is pinned in place, which
 * iOS Safari needs (overflow:hidden alone still scrolls it), and the scroll
 * position is put back on close. Pinning with position:fixed drops the
 * document's scroll offset, hence the top offset and the restore. A modal
 * that navigates away closes first (flushSync), so the offset is back by
 * the time the router saves it for Back.
 */
export function useScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const { overflow, position, top, width } = document.body.style;
    Object.assign(document.body.style, {
      position: 'fixed',
      top: `-${scrollY}px`,
      width: '100%',
      overflow: 'hidden',
    });
    return () => {
      Object.assign(document.body.style, { overflow, position, top, width });
      // 'instant' is required: the legacy two-arg form resolves to 'auto',
      // which inherits html{scroll-behavior:smooth} and glides on dismiss.
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    };
  }, [open]);
}
