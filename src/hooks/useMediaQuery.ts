import { useCallback, useSyncExternalStore } from 'react';

function mediaQuery(query: string): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
}

/** Whether a CSS media query matches, following the viewport as it changes. */
export function useMediaQuery(query: string): boolean {
  // Stable per query, so re-renders don't drop and re-add the listener.
  const subscribe = useCallback((onChange: () => void) => {
    const mql = mediaQuery(query);
    mql?.addEventListener('change', onChange);
    return () => mql?.removeEventListener('change', onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => mediaQuery(query)?.matches ?? false, () => false);
}
