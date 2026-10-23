import { useEffect } from 'react';

/**
 * Keeps the screen on while `active`, so a phone left on the table between
 * turns doesn't lock. The browser drops the lock whenever the page is
 * hidden, so it is asked for again each time the page comes back, and the
 * system can drop it while the page is in view (battery saver turning on),
 * so it is asked for again then too. Where the Screen Wake Lock API is
 * missing, or the request is refused (battery saver, a browser policy), the
 * screen just sleeps as usual; a refusal grants no lock, so there is
 * nothing to drop and nothing asks again until the page next comes back.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let pending = false;
    let done = false;

    function request() {
      if (pending || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      pending = true;
      navigator.wakeLock.request('screen').then(
        (sentinel) => {
          pending = false;
          if (done) {
            void sentinel.release().catch(() => {});
            return;
          }
          lock = sentinel;
          // Our own release, below, comes after `done`, so it asks nothing;
          // one hiding the page leaves the asking to visibilitychange.
          sentinel.addEventListener('release', () => {
            if (!done) request();
          });
        },
        () => {
          pending = false;
        },
      );
    }

    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
