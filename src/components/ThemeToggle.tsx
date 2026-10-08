import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useTheme, type ThemeChoice } from '../hooks/useTheme';
import { AutoThemeIcon, MoonIcon, SunIcon } from './Icons';

const OPTIONS: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  { value: 'system', label: 'Match system', icon: <AutoThemeIcon /> },
  { value: 'light', label: 'Light', icon: <SunIcon /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
];

// Where each key moves from option i of n.
const MOVES: Record<string, (i: number, n: number) => number> = {
  ArrowDown: (i, n) => (i + 1) % n,
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowUp: (i, n) => (i - 1 + n) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

/**
 * Light, dark or the system's setting, remembered for the next visit. A
 * radio group: one Tab stop, on the chosen theme, and the arrow keys, Home
 * and End move and pick at once, as radios do.
 */
export default function ThemeToggle() {
  const [theme, choose] = useTheme();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const move = MOVES[e.key];
    if (!move) return;
    e.preventDefault();
    const to = move(from, OPTIONS.length);
    choose(OPTIONS[to].value);
    refs.current[to]?.focus();
  };

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          aria-label={o.label}
          title={o.label}
          tabIndex={theme === o.value ? 0 : -1}
          className={`theme-opt${theme === o.value ? ' active' : ''}`}
          onClick={() => choose(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
