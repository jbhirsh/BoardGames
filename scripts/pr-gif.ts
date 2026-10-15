// Record a GIF of the app for a PR's "Visual changes", with the pointer
// drawn in so viewers can see where it goes and what it presses. Headless
// Chromium draws no cursor, and Playwright's video recorder needs an ffmpeg
// build of its own, so frames are screenshots and the system ffmpeg joins
// them. Run the app from a production build (`npm run build`, then
// `vite preview` on a free port) and stub /api/* as e2e/fixtures.ts does.
//
//   const context = await browser.newContext({ viewport: { width: 900, height: 560 } });
//   await showPointer(context);              // before the first page loads
//   const page = await context.newPage();
//   await page.goto('http://127.0.0.1:4192/');
//   const stop = recordFrames(page, { x: 0, y: 0, width: 900, height: 400 }, 'frames');
//   await page.mouse.move(450, 200, { steps: 15 });  // page.mouse, never locator.click()
//   await page.waitForTimeout(1000);                 // a pause to follow it by
//   await page.mouse.down(); await page.mouse.up();
//   await page.mouse.wheel(0, 400);                  // shown as a ↓ by the pointer
//   const { fps } = await stop();
//   framesToGif('frames', 'after.gif', { width: 600, fps });
//
// Move with page.mouse and steps: locator.click() sends no pointer moves,
// so the arrow would jump. Scroll with page.mouse.wheel once the pointer is
// over what scrolls; window.scrollTo shows nothing. Check a few frames before publishing, then host
// the GIF on pr-screenshots and link it by commit SHA.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';

// Runs in the page, so it is plain JS in a string: this project's types have
// no DOM. A fixed layer with pointer-events off can't change what the page
// does. A black arrow follows every pointermove, a red ring shows while a
// button is held, fading dots trail a drag, and a wheel turn shows a chevron
// pointing the way the page scrolls.
const POINTER_SCRIPT = `
addEventListener('DOMContentLoaded', () => {
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none';
  const arrow = document.createElement('div');
  arrow.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15.5 L12.5 22.5 L15.5 21 L12 14 L19 14 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  arrow.style.cssText = 'position:absolute;left:-60px;top:-60px;margin:-3px 0 0 -5px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))';
  const ring = document.createElement('div');
  ring.style.cssText = 'position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #e11d48;background:rgba(225,29,72,.18);opacity:0;transform:scale(.4);transition:opacity .12s,transform .12s';
  const wheel = document.createElement('div');
  wheel.style.cssText = 'position:absolute;width:30px;height:30px;margin:-15px 0 0 22px;border-radius:50%;background:rgba(225,29,72,.9);color:#fff;font:bold 18px/30px system-ui,sans-serif;text-align:center;opacity:0;transition:opacity .25s';
  layer.append(ring, wheel, arrow);
  document.body.appendChild(layer);
  let down = false;
  const dot = (x, y) => {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:rgba(225,29,72,.45);transition:opacity .6s';
    layer.insertBefore(d, ring);
    requestAnimationFrame(() => requestAnimationFrame(() => { d.style.opacity = '0'; }));
    setTimeout(() => d.remove(), 700);
  };
  addEventListener('pointermove', (e) => {
    arrow.style.left = ring.style.left = wheel.style.left = e.clientX + 'px';
    arrow.style.top = ring.style.top = wheel.style.top = e.clientY + 'px';
    if (down) dot(e.clientX, e.clientY);
  }, true);
  let fade;
  addEventListener('wheel', (e) => {
    wheel.textContent = e.deltaY < 0 ? '\u2191' : e.deltaY > 0 ? '\u2193' : e.deltaX < 0 ? '\u2190' : '\u2192';
    wheel.style.opacity = '1';
    clearTimeout(fade);
    fade = setTimeout(() => { wheel.style.opacity = '0'; }, 400);
  }, { capture: true, passive: true });
  addEventListener('pointerdown', () => { down = true; ring.style.opacity = '1'; ring.style.transform = 'scale(1)'; }, true);
  addEventListener('pointerup', () => {
    down = false; ring.style.opacity = '0'; ring.style.transform = 'scale(1.6)';
    setTimeout(() => { ring.style.transform = 'scale(.4)'; }, 150);
  }, true);
});
`;

/** Draws the pointer on every page the context opens after this call. */
export async function showPointer(context: BrowserContext): Promise<void> {
  await context.addInitScript({ content: POINTER_SCRIPT });
}

/**
 * The part of the viewport to record, in CSS pixels from its top left. A
 * clip that runs past the viewport's edge is cut short there, so scroll the
 * page first to bring the whole of it into view.
 */
export interface Clip { x: number; y: number; width: number; height: number }

/** What a recording took: its frame count and the rate they came at. */
export interface Recording { frames: number; fps: number }

/**
 * Screenshots `clip` into `dir` (f0000.png, f0001.png, ...) as fast as they
 * come, ten to twenty a second, until the returned function is called; that
 * resolves once the last frame is written, or rejects with what stopped the
 * loop early. Pass its fps to framesToGif so the GIF plays at the speed the
 * page moved. `dir` is emptied first, so a longer earlier run's frames can't
 * trail on the end of this one.
 */
export function recordFrames(page: Page, clip: Clip, dir: string): () => Promise<Recording> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const start = Date.now();
  let recording = true;
  let frames = 0;
  const loop = (async () => {
    while (recording) {
      await page.screenshot({ path: join(dir, `f${String(frames).padStart(4, '0')}.png`), clip });
      frames++;
    }
  })();
  // Held until stop() awaits it, so a failed screenshot isn't an unhandled
  // rejection that kills the run before it can be reported.
  loop.catch(() => {});
  return async () => {
    recording = false;
    await loop;
    const seconds = (Date.now() - start) / 1000;
    return { frames, fps: Math.max(1, Math.round(frames / seconds)) };
  };
}

/**
 * Joins the frames in `dir` into a looping GIF at `out`, scaled to `width`.
 * One palette for the whole clip, and only the changed rectangle rewritten
 * per frame, keeps a few seconds of UI to a few hundred KB.
 */
export function framesToGif(dir: string, out: string, { width = 600, fps = 10 }: { width?: number; fps?: number } = {}): void {
  const filter = `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, 'f%04d.png'), '-vf', filter, '-loop', '0', out], { stdio: 'inherit' });
}
