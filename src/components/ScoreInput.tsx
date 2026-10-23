import type { ChangeEvent, CSSProperties } from 'react';

interface Props {
  id: string;
  /** The unit shown inside the box; without one the box is a bare input. */
  unit?: string;
  value: string;
  /** The box's border, a category's colour (a CSS colour: a token, or 7 Wonders' own). */
  color?: string;
  negative?: boolean;
  /** More text for the box's description, after its unit: a converted field's points. */
  describedBy?: string;
  label?: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * A score pad's number box, with its unit inside in muted text that screen
 * readers get as the box's description. A phone opens its number pad for
 * it; a box that takes a minus gets it from a ± button beside it
 * (SignButton), since that pad has no minus key. With a unit, the box is a
 * wrapper holding the score's input, as wide as its text, then a space and
 * the unit: "7 coins" reads as one line of text centred in the box. --chars
 * sizes the input where the browser can't size it to its text.
 */
export default function ScoreInput({ id, unit, value, color, negative = false, describedBy, label, onChange }: Props) {
  const input = (
    <input
      id={id}
      className="sc-input"
      type="number"
      inputMode="numeric"
      pattern={negative ? undefined : '[0-9]*'}
      min={negative ? undefined : 0}
      placeholder="0"
      aria-label={label}
      aria-describedby={[unit && `${id}-unit`, describedBy].filter(Boolean).join(' ') || undefined}
      value={value}
      onChange={onChange}
      style={
        unit
          ? ({ '--chars': Math.max(1, value.length) } as CSSProperties)
          : color
            ? ({ '--box-color': color } as CSSProperties)
            : undefined
      }
    />
  );
  if (!unit) return input;
  return (
    <span className="sc-field" style={color ? ({ '--box-color': color } as CSSProperties) : undefined}>
      {input}{' '}
      <span className="sc-unit" id={`${id}-unit`} aria-hidden="true">
        {unit}
      </span>
    </span>
  );
}

interface CountProps {
  id: string;
  label: string;
  /** What one is worth, under the label: "6 VP each". */
  worth: string;
  /** What's counted, inside the box: "cards", "routes". */
  unit: string;
  value: string;
  /** The row's points, beside the label: "= 24 VP". */
  points: string;
  onChange: (text: string) => void;
}

/**
 * A row of a pad that counts things (cards, routes): the name, what one is
 * worth and what they come to, then the box. The worth and points are out
 * of the box's name and in its description, as 7 Wonders' Treasury has.
 */
export function CountRow({ id, label, worth, unit, value, points, onChange }: CountProps) {
  return (
    <div className="sc-row">
      <label className="sc-label" htmlFor={id}>
        <span className="sc-label-text">
          {label}
          <span className="sc-vp-note" id={`${id}-worth`} aria-hidden="true">
            {worth}
          </span>
          <span className="sc-vp-note sc-vp-pts" id={`${id}-pts`} aria-hidden="true">
            {points}
          </span>
        </span>
      </label>
      <ScoreInput
        id={id}
        unit={unit}
        value={value}
        describedBy={`${id}-worth ${id}-pts`}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** The ± beside a box that can go below zero, off until there's a number to flip. */
export function SignButton({ label, value, onFlip }: { label: string; value: number; onFlip: () => void }) {
  return (
    <button
      type="button"
      className="sc-sign"
      aria-label={label}
      title={value === 0 ? 'Type the number first' : undefined}
      disabled={value === 0}
      onClick={onFlip}
    >
      &plusmn;
    </button>
  );
}
