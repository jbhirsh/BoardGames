// The display name this browser typed once (for suggestions and the owner's
// additions), remembered in localStorage.
const NAME_KEY = 'gameroom:name';

export function getDisplayName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

export function setDisplayName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage unavailable (private mode); the name just isn't remembered.
  }
}
