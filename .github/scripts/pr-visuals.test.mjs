// @vitest-environment node
// A Node script's test: Node's environment, where import.meta.url is a file URL.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkPrVisuals, report, uiFiles } from './pr-visuals.mjs';

describe('uiFiles', () => {
  it('keeps components and stylesheets under src', () => {
    expect(
      uiFiles(['src/components/GameCard.tsx', 'src/App.css', 'src/utils/filterGames.ts', 'api/chat.ts']),
    ).toEqual(['src/components/GameCard.tsx', 'src/App.css']);
  });

  it('drops tests and the files that draw nothing', () => {
    expect(
      uiFiles(['src/__tests__/GameCard.test.tsx', 'src/__tests__/testData.ts', 'src/Foo.test.tsx', 'README.md']),
    ).toEqual([]);
    expect(uiFiles(['src/context/FilterContext.tsx', 'src/main.tsx', 'src/App.tsx'])).toEqual(['src/App.tsx']);
  });
});

describe('checkPrVisuals', () => {
  const ui = ['src/components/FilterBar/DurationDropdown.tsx'];
  const template = readFileSync(new URL('../pull_request_template.md', import.meta.url), 'utf8');

  it('passes a PR with no UI files, whatever the description', () => {
    expect(checkPrVisuals({ files: ['api/chat.ts'], body: '' }).ok).toBe(true);
    expect(checkPrVisuals({ files: ['package-lock.json'], body: undefined }).ok).toBe(true);
  });

  it('fails a UI change with no picture, naming the files', () => {
    expect(checkPrVisuals({ files: ui, body: 'Fixes the dropdown.' })).toEqual({ ok: false, ui });
    expect(checkPrVisuals({ files: ui, body: undefined }).ok).toBe(false);
  });

  it.each([
    ['a markdown image', '![after](https://raw.githubusercontent.com/jbhirsh/BoardGames/pr-screenshots/138/after.png)'],
    ['a markdown GIF', '![open](https://example.com/open.gif)'],
    ['an HTML image', '<img src="https://example.com/a.png" width="300">'],
    ['an HTML video', '<video src="https://example.com/a.mp4"></video>'],
    ['a video with its source inside', '<video>\n<source src="https://example.com/a.mp4">\n</video>'],
    ['an image link with a space before the URL', '![after]( https://example.com/a.png)'],
    ['an uploaded video', 'https://github.com/user-attachments/assets/0f1e2d3c'],
  ])('passes a UI change whose description has %s', (_, body) => {
    expect(checkPrVisuals({ files: ui, body }).ok).toBe(true);
  });

  it('passes a UI change ticked "No visible UI change"', () => {
    expect(checkPrVisuals({ files: ui, body: '- [x] No visible UI change' }).ok).toBe(true);
    expect(checkPrVisuals({ files: ui, body: '* [X] No visible UI change (refactor)' }).ok).toBe(true);
    expect(checkPrVisuals({ files: ui, body: '1. [x] no visible UI change' }).ok).toBe(true);
    expect(checkPrVisuals({ files: ui, body: '> - [x] No visible UI change' }).ok).toBe(true);
    // The box's own words, not a sentence that starts with them.
    expect(checkPrVisuals({ files: ui, body: '- [x] No visible UI changes are hard' }).ok).toBe(false);
  });

  it('fails the untouched template, whose example sits in a comment', () => {
    expect(checkPrVisuals({ files: ui, body: template }).ok).toBe(false);
  });

  it('passes the template once its box is ticked', () => {
    const ticked = template.replace('- [ ] No visible UI change', '- [x] No visible UI change');
    expect(checkPrVisuals({ files: ui, body: ticked }).ok).toBe(true);
  });

  it('ignores pictures in comments, closed or not', () => {
    const img = '<img src="a.png">';
    expect(checkPrVisuals({ files: ui, body: `<!-- ${img} -->` }).ok).toBe(false);
    // An unclosed comment hides the rest of the description.
    expect(checkPrVisuals({ files: ui, body: `<!-- note\n${img}` }).ok).toBe(false);
    // Text after a closed comment still counts.
    expect(checkPrVisuals({ files: ui, body: `<!-- note -->\n${img}` }).ok).toBe(true);
    expect(checkPrVisuals({ files: ui, body: `<!-- a --><!-- b -->${img}` }).ok).toBe(true);
  });

  it('ignores pictures quoted in code', () => {
    expect(checkPrVisuals({ files: ui, body: 'Use `<img src="a.png">` here' }).ok).toBe(false);
    expect(checkPrVisuals({ files: ui, body: '```html\n<img src="a.png">\n```' }).ok).toBe(false);
    expect(checkPrVisuals({ files: ui, body: '~~~\n<img src="a.png">\n~~~' }).ok).toBe(false);
    // An unclosed fence runs to the end, as GitHub renders it.
    expect(checkPrVisuals({ files: ui, body: '```\n<img src="a.png">' }).ok).toBe(false);
    expect(checkPrVisuals({ files: ui, body: 'a `b\n<img src="a.png">` c' }).ok).toBe(false);
  });

  it('does not let a comment quoted in code hide what follows', () => {
    expect(checkPrVisuals({ files: ui, body: '```html\n<!-- example\n```\n![after](https://example.com/a.png)' }).ok).toBe(true);
  });

  it('does not count an unticked box or a mention of an image', () => {
    expect(checkPrVisuals({ files: ui, body: '- [ ] No visible UI change' }).ok).toBe(false);
    expect(checkPrVisuals({ files: ui, body: 'Screenshots: <img> to follow' }).ok).toBe(false);
    expect(checkPrVisuals({ files: ui, body: 'see ![]() later' }).ok).toBe(false);
  });
});

describe('report', () => {
  it('passes with a reason', () => {
    expect(report('api/chat.ts\n', '')).toEqual({ code: 0, message: 'PR visuals: ok (no UI files changed).' });
  });

  it('fails as a GitHub error naming each UI file, from padded, blank-separated lines', () => {
    const { code, message } = report('  src/App.css \n\nsrc/components/GameCard.tsx\napi/chat.ts\n', 'No pictures.');
    expect(code).toBe(1);
    expect(message.split('\n').slice(0, 4)).toEqual([
      '::error::This PR changes the UI but its description shows none of it.',
      'Changed UI files:',
      '  src/App.css',
      '  src/components/GameCard.tsx',
    ]);
    expect(message).toContain('tick "No visible UI change"');
  });
});
