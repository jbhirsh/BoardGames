import { useSyncExternalStore } from 'react';

// The same width as the stylesheet's phone block (App.css, max-width:520px).
const PHONE = '(max-width: 520px)';

function query(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(PHONE)
    : null;
}

function subscribe(onChange: () => void): () => void {
  const mql = query();
  mql?.addEventListener('change', onChange);
  return () => mql?.removeEventListener('change', onChange);
}

/** True at phone widths, following the viewport as it turns or resizes. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => query()?.matches ?? false, () => false);
}
