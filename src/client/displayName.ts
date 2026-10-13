import { safeStorage } from './safeStorage';

// The display name this browser typed once (for suggestions and the owner's
// additions), remembered in localStorage.
const NAME_KEY = 'gameroom:name';

export function getDisplayName(): string | null {
  return safeStorage.get(NAME_KEY);
}

/** Where storage is unavailable (private mode), the name just isn't remembered. */
export function setDisplayName(name: string): void {
  safeStorage.set(NAME_KEY, name);
}
