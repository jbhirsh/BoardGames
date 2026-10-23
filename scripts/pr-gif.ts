// Record a GIF of the app for a PR's "Visual changes", with the pointer
// drawn in so viewers can see where it goes and what it presses, and each
// key press labelled where focus lands. Headless Chromium draws no cursor,
// and Playwright's video recorder needs an ffmpeg build of its own, so
// frames come from Chrome's screencast and the system ffmpeg joins them.
//
// Most of the time, run scripts/record-pr-gif.ts (`npm run pr-gif`): it
// builds main and this branch, records a scenario against both, and can
// publish the GIFs for the PR. The functions here are its parts, for a
// recording it doesn't cover:
//
//   const context = await browser.newContext({ viewport: { width: 900, height: 560 } });
//   await showPointer(context);              // before the first page loads
//   const page = await context.newPage();
//   await page.goto('http://127.0.0.1:4192/');
//   const stop = await recordFrames(page, { x: 0, y: 0, width: 900, height: 400 }, 'frames');
//   await glide(page, { x: 450, y: 200 });           // at a person's pace
//   await page.waitForTimeout(1000);                 // a pause to follow it by
//   await click(page, page.getByRole('button', { name: 'Pause' }));
//   await drag(page, { x: 300, y: 200 }, { x: 520, y: 200 });
//   await scroll(page, 400);                         // shown as a ↓ by the pointer
//   await page.keyboard.press('Tab');                // labelled "Tab" by what it focuses
//   await stop();
//   framesToGif('frames', 'after.gif', { width: 600 });
//
// Move with glide, click and drag, which go at a person's pace: page.mouse
// alone, or locator.click(), moves in a few milliseconds, which the GIF
// sees as a jump, with a press too short for its ring to show. Scroll with
// scroll() once the pointer is over what scrolls: page.mouse.wheel leaps
// the whole way at once, and window.scrollTo shows no wheel at all. Leave the pointer inside the recorded area while it rests:
// stop() warns when it sat outside it. End on a pause, for the GIF to hold
// before it loops. Check a few frames before publishing, then host the GIF
// on pr-screenshots and link it by commit SHA.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { OVERLAY_SCRIPT } from './pr-gif-overlay.ts';
import {
  HOLDS,
  concatList,
  cropFilter,
  pngSize,
  restsOutside,
  scaledHeight,
  thinner,
  timeline,
  type Clip,
  type Holds,
  type Move,
  type Rest,
  type Shot,
  type Tick,
} from './pr-gif-timing.ts';

export type { Clip } from './pr-gif-timing.ts';

/** Draws the pointer and key presses (pr-gif-overlay.ts) on every page the context opens after this call. */
export async function showPointer(context: BrowserContext): Promise<void> {
  await context.addInitScript({ content: OVERLAY_SCRIPT });
}

type Target = Locator | { x: number; y: number };

// Where each page's pointer is, as these helpers left it.
const pointers = new WeakMap<Page, { x: number; y: number }>();

async function pointOf(target: Target): Promise<{ x: number; y: number }> {
  if (!('boundingBox' in target)) return target;
  const box = await target.boundingBox();
  if (!box) throw new Error('pr-gif: the target has no box: is it on the page?');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Moves the pointer to the middle of `target` (a locator, or a point) at a
 * person's pace, easing over `ms`, and resolves with where it went. Never
 * page.mouse.move on its own: its steps all go in a few milliseconds, which
 * the recording sees as a jump. The first glide on a page starts the
 * pointer there.
 */
export async function glide(page: Page, target: Target, ms = 500): Promise<{ x: number; y: number }> {
  const to = await pointOf(target);
  const from = pointers.get(page) ?? to;
  // Placed by the clock, not by step: each move waits on a browser that's
  // busy recording, so a set number of steps would take far longer than ms.
  const start = Date.now();
  for (let t = 0; t < 1;) {
    t = from === to ? 1 : Math.min(1, (Date.now() - start) / ms);
    const ease = t * t * (3 - 2 * t);
    await page.mouse.move(from.x + (to.x - from.x) * ease, from.y + (to.y - from.y) * ease);
    if (t < 1) await page.waitForTimeout(16);
  }
  pointers.set(page, to);
  return to;
}

/** Glides to `target` and clicks it, holding the button down long enough for the ring to show. */
export async function click(page: Page, target: Target): Promise<void> {
  await glide(page, target);
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.up();
}

/** Presses on `from`, drags to `to` over `ms` at a person's pace, and lets go. */
export async function drag(page: Page, from: Target, to: Target, ms = 800): Promise<void> {
  await glide(page, from);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await glide(page, to, ms);
  await page.waitForTimeout(250);
  await page.mouse.up();
}

/**
 * Turns the wheel under the pointer by `dy` pixels (down when positive)
 * over `ms`, at a person's pace, so the page glides and the overlay's ↓ or
 * ↑ shows throughout. page.mouse.wheel alone goes the whole way in one
 * turn, which the GIF sees as a leap. Glide over what scrolls first.
 */
export async function scroll(page: Page, dy: number, ms = 700): Promise<void> {
  const start = Date.now();
  for (let done = 0, t = 0; t < 1;) {
    t = Math.min(1, (Date.now() - start) / ms);
    const to = Math.round(dy * t * t * (3 - 2 * t));
    if (to !== done) await page.mouse.wheel(0, to - done);
    done = to;
    if (t < 1) await page.waitForTimeout(16);
  }
}

/**
 * Waits, up to `timeout` ms, for the pictures in view to finish loading (or
 * failing), so a recording doesn't open on blank cards; ones further down
 * load as they're scrolled to. Warns if they hadn't by then.
 */
export async function waitForPictures(page: Page, timeout = 20_000): Promise<void> {
  try {
    await page.waitForFunction(
      `[...document.images].every((img) => {
        const box = img.getBoundingClientRect();
        return box.bottom <= 0 || box.top >= innerHeight || box.width === 0 || img.complete;
      })`,
      undefined,
      { timeout },
    );
  } catch {
    if (!page.isClosed()) console.warn(`pr-gif: some pictures in view hadn't loaded after ${timeout / 1000} s`);
  }
}

/** What a recording took: the frames Chrome sent, the GIF frames they made, and where the pointer rested out of shot. */
export interface Recording {
  sent: number;
  stills: number;
  seconds: number;
  rests: Rest[];
}

/**
 * Records `clip` (CSS pixels from the viewport's top left) into `dir` until
 * the returned function is called; that resolves once the last frame is
 * written. Frames come from Chrome's screencast, one per repaint with the
 * time it was painted, so the GIF plays at the speed the page moved and a
 * still page costs nothing; they are thinned to about `fps` a second (see
 * thinner()). Each frame of motion adds to the GIF's size: 15 keeps a few
 * seconds of a moving row to a few MB, and a menu opening to far less. It writes `frames.ffconcat`, the timeline framesToGif plays
 * (each frame for as long as it was on screen, repeats merged, a long
 * still start and end cut short: see timeline()), and
 * `crop.txt`, which cuts the clip from the whole viewport. It warns when
 * the pointer rested outside the clip, where the GIF can't show it. `dir`
 * is emptied first, so an earlier run's frames can't mix in.
 */
export async function recordFrames(
  page: Page,
  clip: Clip,
  dir: string,
  { fps = 15, holds = HOLDS }: { fps?: number; holds?: Holds } = {},
): Promise<() => Promise<Recording>> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const start = Date.now();
  const shots: Shot[] = [];
  const thin = thinner<{ at: number; png: Buffer }>(1000 / fps);
  let sent = 0;
  let scale = 1;
  const keep = (frame: { at: number; png: Buffer } | null) => {
    if (!frame) return;
    const file = `f${String(shots.length).padStart(4, '0')}.png`;
    writeFileSync(join(dir, file), frame.png);
    shots.push({ file, at: frame.at, hash: createHash('sha1').update(frame.png).digest('hex') });
  };
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const png = Buffer.from(data, 'base64');
    scale = pngSize(png).width / metadata.deviceWidth;
    sent++;
    keep(thin.push({ at: (metadata.timestamp ?? Date.now() / 1000) * 1000, png }));
    void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  // For the key labels, which keep inside what is recorded, and the ticks,
  // which watch it: set again on each page a scenario loads.
  const setClip = () => page.evaluate(`window.__prGifClip = ${JSON.stringify(clip)}`).catch(() => {});
  page.on('domcontentloaded', setClip);
  await setClip();
  await cdp.send('Page.startScreencast', { format: 'png' });
  return async () => {
    const end = Date.now();
    await cdp.send('Page.stopScreencast');
    keep(thin.flush());
    await cdp.detach();
    page.off('domcontentloaded', setClip);
    await page.evaluate('delete window.__prGifClip');
    const ticks = (await page.evaluate('window.__prGifTicks || []')) as Tick[];
    const stills = timeline(shots, end, holds, { ticks, frame: 1000 / fps });
    writeFileSync(join(dir, 'frames.ffconcat'), concatList(stills));
    writeFileSync(join(dir, 'crop.txt'), cropFilter(clip, scale));
    const moves = (await page.evaluate('window.__prGifMoves || []')) as Move[];
    const rests = restsOutside(moves, clip, start, end);
    for (const r of rests) {
      console.warn(
        `pr-gif: the pointer rested out of shot at (${r.x}, ${r.y}) for ${r.ms} ms, ${r.at} ms in; keep it inside the clip`,
      );
    }
    return { sent, stills: stills.length, seconds: (end - start) / 1000, rests };
  };
}

// One palette for the whole clip, and only the changed rectangle rewritten
// per frame, keeps a few seconds of UI to a few hundred KB. The frames keep
// their own durations (vfr), from the concat list.
const PALETTE =
  'split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';

const crop = (dir: string) => readFileSync(join(dir, 'crop.txt'), 'utf8');

function ffmpeg(inputs: string[], filter: string, out: string): void {
  const args = ['-y', '-loglevel', 'error'];
  for (const list of inputs) args.push('-f', 'concat', '-safe', '0', '-i', list);
  args.push('-filter_complex', filter, '-fps_mode', 'vfr', '-loop', '0', out);
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
}

/**
 * Joins the frames recordFrames left in `dir` into a looping GIF at `out`,
 * scaled to `width`. The screencast's frames are 1× whatever the device
 * scale factor, so a GIF narrower than the clip is the sharp one.
 */
export function framesToGif(dir: string, out: string, { width = 600 }: { width?: number } = {}): void {
  ffmpeg([join(dir, 'frames.ffconcat')], `[0:v]${crop(dir)},scale=${width}:-1:flags=lanczos,${PALETTE}`, out);
}

// The band each half's label sits in, in GIF pixels.
const LABEL_BAND = 34;

/**
 * Joins two recordings of the same clip, before and after, into one GIF
 * `width` wide: side by side, each under its label, starting together (the
 * shorter holds its last frame until the longer ends). Two runs of a
 * scenario never keep perfect time, so the halves can drift by a beat. Suits a change to
 * behaviour, seen in one glance; a change to layout reads better as two
 * GIFs, each at full size.
 */
export function sideBySide(
  beforeDir: string,
  afterDir: string,
  out: string,
  { width = 900, labels = ['Before', 'After'] }: { width?: number; labels?: [string, string] } = {},
): void {
  const half = Math.floor((width - 8) / 4) * 2;
  const crops = [crop(beforeDir), crop(afterDir)];
  // A change can make the clip taller or shorter: the shorter is padded to
  // the taller, as hstack needs.
  const heights = crops.map((c) => scaledHeight(c, half));
  const tallest = Math.max(...heights);
  const side = (input: number, label: string) =>
    `[${input}:v]${crops[input]},scale=${half}:${heights[input]}:flags=lanczos,` +
    `pad=iw:${tallest}:0:0:color=white,` +
    `pad=iw:ih+${LABEL_BAND}:0:${LABEL_BAND}:color=0xf3f4f6,` +
    `drawtext=font=Sans:text='${label}':fontsize=18:fontcolor=0x1f2937:x=(w-text_w)/2:y=(${LABEL_BAND}-text_h)/2[s${input}]`;
  const filter = `${side(0, labels[0])};${side(1, labels[1])};[s0]pad=iw+8:ih:0:0:color=white[l];[l][s1]hstack=inputs=2,${PALETTE}`;
  ffmpeg([join(beforeDir, 'frames.ffconcat'), join(afterDir, 'frames.ffconcat')], filter, out);
}

/**
 * What record-pr-gif.ts records: a page of the app, the stretch of it to
 * capture, and what the pointer and keyboard do there. A scenario is a
 * module whose default export is one of these.
 */
export interface Scenario {
  /** The page to open, from the app's root: '/' by default. */
  path?: string;
  /** The browser window, in CSS pixels: 900 × 560 by default. */
  viewport?: { width: number; height: number };
  /** The colour scheme the page sees: light by default. */
  colorScheme?: 'light' | 'dark';
  /** What to record, or how to work it out once the page has loaded (e.g. from an element's box). */
  clip: Clip | ((page: Page) => Promise<Clip>);
  /** Before the page loads: more stubs (page.route, which wins over the defaults), storage, init scripts. */
  setup?: (page: Page) => Promise<void>;
  /** After it has loaded, before recording starts: scroll into place, open a panel, wait for it to settle. */
  ready?: (page: Page) => Promise<void>;
  /** What is recorded: the pointer moves, presses, wheel turns and keys. */
  play: (page: Page) => Promise<void>;
  /** Each GIF's width in pixels: 700 by default. A side-by-side GIF is 1000 wide; --width overrides both. */
  width?: number;
}
