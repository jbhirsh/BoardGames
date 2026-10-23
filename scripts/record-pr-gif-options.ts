// The pure half of scripts/record-pr-gif.ts: reading its command line,
// telling the repository from the origin remote, and writing the PR's
// Markdown. Unit tested (record-pr-gif-options.test.ts).
import { parseArgs } from 'node:util';

export const USAGE =
  'usage: npm run pr-gif -- <scenario.ts> [--name <dir>] [--base <ref>] [--after-only] [--side-by-side] ' +
  '[--width <px>] [--fps <n>] [--fixtures] [--keep] [--publish]';

/** What record-pr-gif.ts was asked to do. */
export interface Options {
  /** The scenario module's path. */
  scenario: string;
  /** The folder the GIFs go in, here and on pr-screenshots: the scenario's file name by default. */
  name: string;
  /** What "before" is built from. */
  base: string;
  /** Skip the base: for UI that is new. */
  afterOnly: boolean;
  /** One GIF of the two side by side, rather than two. */
  sideBySide: boolean;
  /** The GIF's width in pixels, over the scenario's own (or the defaults). */
  width?: number;
  /** The most frames a second kept. */
  fps: number;
  /** The stubbed API's empty data, rather than the live site's. */
  fixtures: boolean;
  /** Keep the work directory (builds, frames) to look at. */
  keep: boolean;
  /** Commit the GIFs to pr-screenshots, push, and print the Markdown. */
  publish: boolean;
}

function positive(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!(n > 0)) throw new Error(`${flag} takes a positive number\n${USAGE}`);
  return n;
}

/** Reads the command line after the script's name. Throws, with the usage, on anything it can't use. */
export function parseOptions(argv: string[]): Options {
  const parsed = (() => {
    try {
      return parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          name: { type: 'string' },
          base: { type: 'string', default: 'origin/main' },
          'after-only': { type: 'boolean', default: false },
          'side-by-side': { type: 'boolean', default: false },
          width: { type: 'string' },
          fps: { type: 'string', default: '15' },
          fixtures: { type: 'boolean', default: false },
          keep: { type: 'boolean', default: false },
          publish: { type: 'boolean', default: false },
        },
      });
    } catch (error) {
      throw new Error(`${(error as Error).message}\n${USAGE}`, { cause: error });
    }
  })();
  const { values, positionals } = parsed;
  if (positionals.length !== 1) throw new Error(`one scenario, please\n${USAGE}`);
  if (values['side-by-side'] && values['after-only'])
    throw new Error('--side-by-side needs a before: drop --after-only');
  const scenario = positionals[0];
  const name = values.name ?? scenario.replace(/^.*\//, '').replace(/\.[^.]*$/, '');
  if (!/^[\w.-]+$/.test(name) || /^\.+$/.test(name))
    throw new Error(`--name is one folder name (letters, digits, . _ -), not ${name}`);
  return {
    scenario,
    name,
    base: values.base,
    afterOnly: values['after-only'],
    sideBySide: values['side-by-side'],
    width: positive('--width', values.width),
    fps: positive('--fps', values.fps)!,
    fixtures: values.fixtures,
    keep: values.keep,
    publish: values.publish,
  };
}

/** The browser window a scenario gets unless it names one: a phone, as the site is designed phone first. */
export const PHONE = { width: 390, height: 844 };

/**
 * A GIF's width when neither --width nor the scenario sets one: the window's
 * own, so a phone's frames aren't blown up, but no more than 700; side by
 * side, two of those (each at most 496) and the 8px between them.
 */
export function defaultWidth(viewportWidth: number, sideBySide: boolean): number {
  if (!sideBySide) return Math.min(700, viewportWidth);
  // sideBySide (pr-gif.ts) splits its width into two even halves.
  const half = Math.floor(Math.min(496, viewportWidth) / 2) * 2;
  return 2 * half + 8;
}

/**
 * The owner/repo of a GitHub remote, for the raw links: https (with or
 * without a token or `.git`), `git@github.com:`, `ssh://`, or an SSH host
 * alias such as `github.com-work`.
 */
export function repoFromRemote(url: string): string {
  const slug = /github\.com[^/:]*[/:](?:\d+\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(url.trim())?.[1];
  if (!slug) throw new Error(`origin isn't a GitHub repository (${url})`);
  return slug;
}

/**
 * The Markdown for the PR's "Visual changes": a Before | After table, or the
 * one side-by-side GIF, linked by the pr-screenshots commit's SHA so a later
 * push can't change what the PR shows.
 */
export function markdown({
  repo,
  sha,
  name,
  gifs,
}: {
  repo: string;
  sha: string;
  name: string;
  gifs: string[];
}): string {
  const img = (gif: string, width: number) =>
    `<img src="https://raw.githubusercontent.com/${repo}/${sha}/${name}/${gif}" width="${width}">`;
  if (gifs.length === 2)
    return `| Before (\`main\`) | After |\n|---|---|\n| ${img(gifs[0], 400)} | ${img(gifs[1], 400)} |`;
  return img(gifs[0], gifs[0] === 'side-by-side.gif' ? 800 : 500);
}
