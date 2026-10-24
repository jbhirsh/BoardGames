import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useTheme, type ThemeChoice } from '../hooks/useTheme';
import { radioMove } from '../utils/radioMove';
import { AutoThemeIcon, MoonIcon, SunIcon } from './Icons';

const OPTIONS: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  { value: 'system', label: 'Match system', icon: <AutoThemeIcon /> },
  { value: 'light', label: 'Light', icon: <SunIcon /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
];

/**
 * Light, dark or the system's setting, remembered for the next visit. A
 * radio group: one Tab stop, on the chosen theme, and the arrow keys, Home
 * and End move and pick at once, as radios do.
 */
export default function ThemeToggle() {
  const [theme, choose] = useTheme();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const to = radioMove(e.key, from, OPTIONS.length);
    if (to === null) return;
    e.preventDefault();
    choose(OPTIONS[to].value);
    refs.current[to]?.focus();
  };

  return (
    <div
      className="static top-4 right-gutter z-1 m-0 flex w-max gap-0.5 rounded-[999px] border border-border bg-surface p-0.75 shadow-(--shadow-sm) max-sm:col-2 max-sm:row-1 sm:mb-6 sm:ml-auto xl:absolute xl:mb-0 xl:ml-0 xl:w-auto"
      role="radiogroup"
      aria-label="Colour theme"
    >
      {OPTIONS.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          aria-label={o.label}
          title={o.label}
          tabIndex={theme === o.value ? 0 : -1}
          className={`inline-flex size-7.5 cursor-pointer items-center justify-center rounded-[50%] [transition:background_0.15s,color_0.15s] max-sm:relative max-sm:after:absolute max-sm:after:-inset-x-px max-sm:after:-inset-y-1.75 max-sm:after:content-[''] ${theme === o.value ? 'active bg-blue-bg2 text-blue' : 'text-text2 hover:text-text'}`}
          onClick={() => choose(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
