import { readFileSync } from 'fs';
import { join } from 'path';

// App.css's theme blocks, for the token tests: the light :root, the system
// dark theme and the toggle's dark theme.
const css = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8');
export const BLOCKS = {
  light: css.slice(0, css.indexOf('/* ══ DARK THEME')),
  'system dark': css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf(':root[data-theme="dark"]')),
  'toggled dark': css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf('@media(max-width:900px)')),
};

/** The six-digit hex a block gives `--name`. */
export function token(block: string, name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block);
  if (!m) throw new Error(`--${name} not set`);
  return m[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of two hex colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The `r,g,b` triple a block gives `--name` (e.g. --blue-rgb). */
export function rgbToken(block: string, name: string): [number, number, number] {
  const m = new RegExp(`--${name}:\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)`).exec(block);
  if (!m) throw new Error(`--${name} not set`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** The hex an `rgba(rgb, alpha)` tint composites to over the hex `base`. */
export function mix(rgb: readonly [number, number, number], alpha: number, base: string): string {
  return '#' + [1, 3, 5].map((i, k) => Math.round(rgb[k] * alpha + parseInt(base.slice(i, i + 2), 16) * (1 - alpha))
    .toString(16).padStart(2, '0')).join('');
}

/** Every custom property a block declares, name to value. */
export function declarations(block: string): Map<string, string> {
  return new Map([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
