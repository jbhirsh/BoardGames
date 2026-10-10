import { describe, it, expect } from 'vitest';
import { BLOCKS, token, rgbToken, mix, contrast, declarations } from './themeTokens';

// The theme tokens App.css draws on top of one another. When a fill matched
// the one under it, the dark theme lost the assistant's answer bubble, the
// filter sheet's close button and the dropdown's fills (#192).

// A fill drawn on another fill, and where. Each must differ from its base.
const FILL_ON_FILL: [fill: string, base: string, where: string][] = [
  ['surface', 'bg', 'cards, panels and the filter sheet on the page'],
  ['bg2', 'surface', "the assistant's answer bubble in the chat panel, the filter sheet's close and Clear buttons, the Keywords Any/All buttons and a hovered option in a dropdown, a card's add-ons panel"],
  ['bg2', 'bg', 'the active filters bar, the Own/Want and view toggles, the rulebook tabs, the score calculator tabs'],
  ['surface', 'bg2', "the chosen Own/Want or view button in its track, an add-on's row in a card's add-ons panel"],
  ['bg3', 'bg2', 'a hovered Any/All button, score calculator tab or +/- button'],
  ['row-hover', 'surface', 'a hovered table row'],
  ['info-bg', 'surface', 'a Notice in the word checker panel'],
  ['warn-bg', 'surface', 'a Notice in the word checker panel'],
  ['danger-bg', 'surface', 'a Notice in the word checker panel'],
  ['info-border', 'info-bg', "a Notice's outline"],
  ['warn-border', 'warn-bg', "a Notice's outline"],
  ['danger-border', 'danger-bg', "a Notice's outline"],
];

// A fill is a token, or a translucent tint over a token: `tint` is an
// `r,g,b` token name or a literal triple, as App.css writes it in rgba().
type Fill = string | { tint: string | [number, number, number]; alpha: number; over: string };

function fillHex(block: string, fill: Fill): string {
  if (typeof fill === 'string') return token(block, fill);
  const rgb = typeof fill.tint === 'string' ? rgbToken(block, fill.tint) : fill.tint;
  return mix(rgb, fill.alpha, token(block, fill.over));
}

function fillName(fill: Fill): string {
  if (typeof fill === 'string') return `--${fill}`;
  const tint = typeof fill.tint === 'string' ? `--${fill.tint}` : fill.tint.join(',');
  return `rgba(${tint},${fill.alpha}) over --${fill.over}`;
}

const blueTint = (alpha: number, over: string): Fill => ({ tint: 'blue-rgb', alpha, over });

// Text drawn on a fill, and where. Each must read at 4.5:1 or better.
const TEXT_ON_FILL: [text: string, fill: Fill, where: string][] = [
  ['text', 'bg2', "the assistant's answer bubble, a hovered dropdown option"],
  ['text', 'bg3', 'a hovered Any/All button or score calculator tab'],
  ['text', 'row-hover', 'a hovered table row'],
  ['text2', 'bg', "the hero's subtitle, the chat's scope line"],
  ['text2', 'surface', 'card descriptions, dropdown options'],
  ['text2', 'bg2', "keyword and duration pills, the filter sheet's close button, the Any/All buttons, rulebook tabs"],
  ['text2', 'bg3', 'the house rules count'],
  ['text2', 'row-hover', "a hovered row's players, difficulty and short line"],
  ['text3', 'bg', 'section counts'],
  ['text3', 'surface', 'card meta, dropdown counts, popover titles, the filter sheet section titles'],
  ['text3', 'bg2', "table headers, the toggles' other buttons, the score calculator tabs, a hovered option's count, Clear all"],
  ['text3', 'row-hover', "a hovered row's chevron and credit"],
  ['text3', 'bg3', "a score calculator tab's name while its remove button is hovered"],
  ['blue', 'bg2', "links in the assistant's answer bubble, the Share link on the active filters bar, the sorted column's arrow"],
  ['blue', 'bg3', "the sorted column's arrow while its header is hovered"],
  ['blue', blueTint(0.08, 'bg2'), 'an active filter chip on the active filters bar, hovered or not; a hovered Rules link in an expanded row'],
  ['blue', blueTint(0.08, 'surface'), 'a hovered or lit keyword pill on a card'],
  ['blue', blueTint(0.08, 'bg'), 'an active filter button on the filter bar'],
  ['blue', blueTint(0.08, 'row-hover'), "a hovered row's add-ons tag, hovered or open"],
  ['blue', blueTint(0.15, 'surface'), "the chosen theme, a hovered card's add-ons button"],
  ['award-fg', { tint: [201, 162, 39], alpha: 0.12, over: 'bg2' }, "the award count in an expanded row"],
  ['award-fg', { tint: [201, 162, 39], alpha: 0.24, over: 'bg2' }, 'the award count in an expanded row, hovered or open'],
  ['award-fg', { tint: [201, 162, 39], alpha: 0.24, over: 'surface' }, 'the award count on a card, hovered or open'],
  ['expansion-fg', { tint: [176, 108, 0], alpha: 0.12, over: 'bg2' }, "an expansion's chip on its rulebook tab"],
  ['extension-fg', { tint: [30, 123, 75], alpha: 0.12, over: 'bg2' }, "an extension's chip on its rulebook tab"],
  ['version-fg', blueTint(0.1, 'bg2'), "a version's chip on its rulebook tab"],
  ['ok-fg', { tint: [52, 199, 89], alpha: 0.12, over: 'surface' }, "the word checker's playable verdict"],
  ['bad-fg', { tint: [255, 59, 48], alpha: 0.1, over: 'surface' }, "the word checker's not-playable verdict"],
];

// Pairs the light theme already failed before #192, which retuned the dark
// theme and, in light, only the word checker's green. Each is skipped in
// the check below and must still fail here:
// once one passes, take it off this list so the check covers it again.
const LIGHT_KNOWN_FAILURES: [text: string, fill: Fill, why: string][] = [
  ['text2', 'bg3', '4.26:1, the house rules count'],
  ['text3', 'bg3', "4.14:1, a score calculator tab's name while its remove button is hovered"],
];
const knownFailure = (theme: string, text: string, fill: Fill) => theme === 'light'
  && LIGHT_KNOWN_FAILURES.some(([t, f]) => t === text && fillName(f) === fillName(fill));

// Text tokens that rank one below the other, so metadata reads under body text.
const TEXT_STEPS: [upper: string, lower: string][] = [
  ['text', 'text2'],
  ['text2', 'text3'],
];

describe('layered theme tokens', () => {
  for (const [theme, block] of Object.entries(BLOCKS)) {
    for (const [fill, base, where] of FILL_ON_FILL) {
      it(`--${fill} differs from the --${base} under it (${theme}): ${where}`, () => {
        expect(token(block, fill).toUpperCase()).not.toBe(token(block, base).toUpperCase());
      });
    }
    for (const [upper, lower] of TEXT_STEPS) {
      it(`--${lower} differs from --${upper} (${theme})`, () => {
        expect(token(block, lower).toUpperCase()).not.toBe(token(block, upper).toUpperCase());
      });
    }
    for (const [text, fill, where] of TEXT_ON_FILL) {
      if (knownFailure(theme, text, fill)) continue;
      it(`--${text} reads at 4.5:1 or better on ${fillName(fill)} (${theme}): ${where}`, () => {
        expect(contrast(token(block, text), fillHex(block, fill))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  for (const [text, fill, why] of LIGHT_KNOWN_FAILURES) {
    it(`still lists --${text} on ${fillName(fill)} as a known light failure (${why})`, () => {
      expect(TEXT_ON_FILL.some(([t, f]) => t === text && fillName(f) === fillName(fill))).toBe(true);
      expect(contrast(token(BLOCKS.light, text), fillHex(BLOCKS.light, fill))).toBeLessThan(4.5);
    });
  }

  it('are the same in both dark blocks, token for token', () => {
    const system = declarations(BLOCKS['system dark']);
    const toggled = declarations(BLOCKS['toggled dark']);
    expect(system.size).toBeGreaterThan(30);
    expect(Object.fromEntries(toggled)).toEqual(Object.fromEntries(system));
  });
});
