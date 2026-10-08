import { useCallback, useState } from 'react';

/** The reader's colour theme: their system's, or one they picked. */
export type ThemeChoice = 'system' | 'light' | 'dark';

/** localStorage key; index.html's first script reads it too, before paint. */
export const THEME_KEY = 'gameroom:theme';

// The browser chrome's colour (theme-color) for each theme: the page's --bg.
const CHROME = { light: '#FBFBFD', dark: '#111113' } as const;

function current(): ThemeChoice {
  const t = document.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : 'system';
}

/**
 * Puts a theme choice in force: on <html> for the stylesheet, in
 * localStorage for the next visit, and on the theme-color tags for the
 * browser's own bars. "system" clears all three back to the media query.
 */
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked (private mode): the choice lasts for this page.
  }
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = CHROME[choice === 'system' ? scheme : choice];
  });
}

export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>(current);
  const choose = useCallback((choice: ThemeChoice) => {
    applyTheme(choice);
    setTheme(choice);
  }, []);
  return [theme, choose];
}
