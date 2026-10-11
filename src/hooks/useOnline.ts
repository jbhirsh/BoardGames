import { useSyncExternalStore } from 'react';

function subscribe(changed: () => void) {
  window.addEventListener('online', changed);
  window.addEventListener('offline', changed);
  return () => {
    window.removeEventListener('online', changed);
    window.removeEventListener('offline', changed);
  };
}

/**
 * Whether the browser says it is online, kept current by its online and
 * offline events. Its word is good for "offline" only: on a Wi-Fi with no
 * way out (a captive portal, a dead router) it still says online, so a
 * request that fails for want of a network needs handling as well.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
