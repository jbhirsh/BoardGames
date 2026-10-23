import { describe, expect, it } from 'vitest';
import { USAGE, defaultWidth, markdown, parseOptions, repoFromRemote } from './record-pr-gif-options.ts';

describe('parseOptions', () => {
  it('takes a scenario, named after its file, with the defaults', () => {
    expect(parseOptions(['scripts/pr-gif-example.ts'])).toEqual({
      scenario: 'scripts/pr-gif-example.ts',
      name: 'pr-gif-example',
      base: 'origin/main',
      afterOnly: false,
      sideBySide: false,
      width: undefined,
      fps: 15,
      fixtures: false,
      keep: false,
      publish: false,
    });
  });

  it('takes every option', () => {
    expect(
      parseOptions([
        'flow.ts',
        '--name',
        '259',
        '--base',
        'origin/release',
        '--side-by-side',
        '--width',
        '900',
        '--fps',
        '20',
        '--fixtures',
        '--keep',
        '--publish',
      ]),
    ).toEqual({
      scenario: 'flow.ts',
      name: '259',
      base: 'origin/release',
      afterOnly: false,
      sideBySide: true,
      width: 900,
      fps: 20,
      fixtures: true,
      keep: true,
      publish: true,
    });
    expect(parseOptions(['flow.ts', '--after-only']).afterOnly).toBe(true);
  });

  it("refuses what it can't use, with the usage", () => {
    expect(() => parseOptions([])).toThrow(USAGE);
    expect(() => parseOptions(['a.ts', 'b.ts'])).toThrow(USAGE);
    expect(() => parseOptions(['a.ts', '--colour'])).toThrow(USAGE);
    expect(() => parseOptions(['a.ts', '--fps', '0'])).toThrow('--fps takes a positive number');
    expect(() => parseOptions(['a.ts', '--width', 'wide'])).toThrow('--width takes a positive number');
    expect(() => parseOptions(['a.ts', '--side-by-side', '--after-only'])).toThrow('--side-by-side needs a before');
    expect(() => parseOptions(['a.ts', '--name', '../up'])).toThrow('--name is one folder name');
    expect(() => parseOptions(['a.ts', '--name', '..'])).toThrow('--name is one folder name');
    expect(() => parseOptions(['a.ts', '--name', '.'])).toThrow('--name is one folder name');
    expect(parseOptions(['a.ts', '--name', 'v1.2']).name).toBe('v1.2');
  });
});

describe('repoFromRemote', () => {
  it('reads owner/repo from every shape of GitHub remote', () => {
    for (const url of [
      'https://github.com/jbhirsh/BoardGames',
      'https://github.com/jbhirsh/BoardGames.git',
      'https://x-access-token:abc@github.com/jbhirsh/BoardGames.git',
      'https://github.com/jbhirsh/BoardGames/',
      'git@github.com:jbhirsh/BoardGames.git',
      'git@github.com-work:jbhirsh/BoardGames.git',
      'ssh://git@github.com/jbhirsh/BoardGames.git',
      'ssh://git@ssh.github.com:443/jbhirsh/BoardGames.git',
    ]) {
      expect(repoFromRemote(url), url).toBe('jbhirsh/BoardGames');
    }
  });

  it("refuses a remote that isn't GitHub", () => {
    expect(() => repoFromRemote('https://gitlab.com/jbhirsh/BoardGames.git')).toThrow(
      "origin isn't a GitHub repository",
    );
  });
});

describe('markdown', () => {
  const at = { repo: 'jbhirsh/BoardGames', sha: 'abc123', name: '259' };
  const raw = 'https://raw.githubusercontent.com/jbhirsh/BoardGames/abc123/259';

  it('puts a before and an after in a table, linked by the commit', () => {
    expect(markdown({ ...at, gifs: ['before.gif', 'after.gif'] })).toBe(
      '| Before (`main`) | After |\n|---|---|\n' +
        `| <img src="${raw}/before.gif" width="400"> | <img src="${raw}/after.gif" width="400"> |`,
    );
  });

  it('shows a single GIF on its own, a side-by-side one wider', () => {
    expect(markdown({ ...at, gifs: ['after.gif'] })).toBe(`<img src="${raw}/after.gif" width="500">`);
    expect(markdown({ ...at, gifs: ['side-by-side.gif'] })).toBe(`<img src="${raw}/side-by-side.gif" width="800">`);
  });
});

describe('defaultWidth', () => {
  it("keeps a phone's frames at their size, and caps a wide window", () => {
    expect(defaultWidth(390, false)).toBe(390);
    expect(defaultWidth(900, false)).toBe(700);
  });

  it('puts two of them side by side, 8px apart, each in even pixels', () => {
    expect(defaultWidth(390, true)).toBe(788);
    expect(defaultWidth(375, true)).toBe(756);
    expect(defaultWidth(900, true)).toBe(1000);
  });
});
