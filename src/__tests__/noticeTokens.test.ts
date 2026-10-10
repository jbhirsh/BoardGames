import { describe, it, expect } from 'vitest';
import { BLOCKS, token, contrast } from './themeTokens';

// The Notice tones' text on their fill, in each theme block of App.css: the
// light :root, the system dark theme and the toggle's dark theme.
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
