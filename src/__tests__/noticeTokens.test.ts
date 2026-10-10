import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// The Notice tones' text on their fill, in each theme block of App.css: the
// light :root, the system dark theme and the toggle's dark theme.
const css = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8');
const BLOCKS = {
  light: css.slice(0, css.indexOf('/* ══ DARK THEME')),
  'system dark': css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf(':root[data-theme="dark"]')),
  'toggled dark': css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf('@media(max-width:900px)')),
};

function token(block: string, name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block);
  if (!m) throw new Error(`--${name} not set`);
  return m[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('notice tokens', () => {
  for (const [theme, block] of Object.entries(BLOCKS)) {
    for (const tone of ['info', 'warn', 'danger']) {
      it(`${tone} text reads at 4.5:1 or better on its fill (${theme})`, () => {
        expect(contrast(token(block, `${tone}-fg`), token(block, `${tone}-bg`))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('are the same in both dark blocks', () => {
    for (const name of ['info', 'warn', 'danger'].flatMap((t) => [`${t}-fg`, `${t}-bg`, `${t}-border`])) {
      expect(token(BLOCKS['system dark'], name)).toBe(token(BLOCKS['toggled dark'], name));
    }
  });
});
