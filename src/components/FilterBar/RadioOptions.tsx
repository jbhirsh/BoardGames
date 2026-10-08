import { useRef, type KeyboardEvent } from 'react';

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T> {
  /** Names the group for assistive tech, e.g. "Players". */
  label: string;
  options: readonly Option<T>[];
  selected: T;
  onSelect: (value: T) => void;
}

// Where each key moves focus from option i of n.
const MOVES: Record<string, (i: number, n: number) => number> = {
  ArrowDown: (i, n) => (i + 1) % n,
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowUp: (i, n) => (i - 1 + n) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

/**
 * A dropdown's single-choice options: a radio group, so assistive tech
 * announces one choice out of several (the multi-choice keywords list keeps
 * its checkboxes), drawn with round marks to match. The group is one Tab
 * stop, on the chosen option; the arrow keys, Home and End move between
 * options and Enter or Space picks one. Unlike a standalone radio group,
 * moving doesn't pick, because picking closes the dropdown.
 */
export default function RadioOptions<T extends string | number>({ label, options, selected, onSelect }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = options.findIndex((opt) => opt.value === selected);
  const tabStop = chosen === -1 ? 0 : chosen;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const move = MOVES[e.key];
    if (!move) return;
    e.preventDefault();
    refs.current[move(from, options.length)]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label}>
      {options.map((opt, i) => {
        const isSel = opt.value === selected;
        return (
          <button
            key={opt.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={isSel}
            tabIndex={i === tabStop ? 0 : -1}
            className={`dd-opt${isSel ? ' sel' : ''}`}
            onClick={() => onSelect(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className="dd-chk dd-radio" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
