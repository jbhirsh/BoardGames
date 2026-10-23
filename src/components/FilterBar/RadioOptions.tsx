import { useRef, type KeyboardEvent } from 'react';
import { radioMove } from '../../utils/radioMove';

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
    const to = radioMove(e.key, from, options.length);
    if (to === null) return;
    e.preventDefault();
    refs.current[to]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label}>
      {options.map((opt, i) => {
        const isSel = opt.value === selected;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
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
