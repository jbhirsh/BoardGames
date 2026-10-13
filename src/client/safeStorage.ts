// Web Storage that never throws. Reaching localStorage or sessionStorage can
// fail: a SecurityError where site data is blocked (some private modes), a
// QuotaExceededError when it is full, or no storage at all. Every caller
// treats those the same way, as nothing stored and nothing remembered, so
// they are caught here once.

export interface SafeStorage {
  /** The stored value, or null when there is none or storage can't be read. */
  get(key: string): string | null;
  /** Stores the value, and says whether it was stored. */
  set(key: string, value: string): boolean;
  remove(key: string): void;
}

/** A SafeStorage over a store reached through `store`, which may itself throw. */
export function createSafeStorage(store: () => Storage): SafeStorage {
  return {
    get(key) {
      try {
        return store().getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        store().setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        store().removeItem(key);
      } catch {
        // Nothing could have been stored there either.
      }
    },
  };
}

/** localStorage, kept across visits. */
export const safeStorage = createSafeStorage(() => window.localStorage);

/** sessionStorage, kept for the tab's session, which a reload outlives. */
export const safeSessionStorage = createSafeStorage(() => window.sessionStorage);
