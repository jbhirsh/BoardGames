// The pure half of scripts/pr-gif.ts: turning a recording's frames into a
// GIF's timeline, spotting a pointer left outside the recorded area, and
// naming a key press for the overlay. No browser, no ffmpeg, no files, so
// all of it is unit tested (pr-gif-timing.test.ts).

/** A screenshot taken while recording: its file, when it was taken (ms), and a hash of its pixels. */
export interface Shot { file: string; at: number; hash: string }

/** A frame of the GIF and how long it shows, in ms. */
export interface Still { file: string; ms: number }

/** The most the GIF dwells on its first and last frames. */
export interface Holds { lead: number; tail: number }

export const HOLDS: Holds = { lead: 500, tail: 1500 };

// Browsers show a GIF frame of under 20 ms for 100 ms, so a brief frame
// would stall the clip rather than flash by. GIF delays are whole
// hundredths of a second.
const MIN_MS = 20;
const TICK = 10;

/**
 * One of the page's animation frames, as the overlay saw it: when (ms), and
 * whether anything in the recorded area moved since the frame before (an
 * animation or transition running there, the pointer, a key, the wheel).
 */
export interface Tick { t: number; moving: boolean }

/**
 * How long, of `from` to `to`, the page was still by its ticks (in time
 * order): the stretches between ticks in which nothing moved. Undefined
 * when no tick falls inside, as nothing then says either way.
 */
export function stillTime(ticks: Tick[], from: number, to: number): number | undefined {
  let still = 0;
  let previous = from;
  let seen = false;
  for (const { t, moving } of ticks) {
    if (t <= from) continue;
    if (t > to) break;
    if (!moving) still += t - previous;
    previous = t;
    seen = true;
  }
  return seen ? still : undefined;
}

/**
 * The GIF's frames from the screenshots, each shown until the next was
 * taken, so the clip plays at the speed the page moved however unevenly the
 * screenshots came.
 *   - Stalls are cut. Chrome sometimes paints nothing for a quarter-second
 *     on a busy machine while things are still moving, and the GIF would
 *     freeze there and then jump. A frame lasting over twice `frame` (the
 *     usual gap between frames kept) shows only for the time the page's
 *     `ticks` say it was still, plus one `frame`; without ticks, as long as
 *     it lasted.
 *   - A run of identical screenshots becomes one frame, shown for the
 *     run's whole time.
 *   - Nothing is held longer than it was on screen, so a page in motion
 *     never freezes. The first frame shows for at most `lead` (a still
 *     page before anything happens is dead air), and the last for at most
 *     `tail` (a beat before the loop starts again: a scenario that ends
 *     with a pause holds there).
 * `end` is when recording stopped. Durations round to a GIF's hundredths;
 * none is under 20 ms.
 */
export function timeline(
  shots: Shot[],
  end: number,
  holds: Holds = HOLDS,
  { ticks = [], frame = 1000 / 15 }: { ticks?: Tick[]; frame?: number } = {},
): Still[] {
  const runs: { file: string; hash: string; ms: number }[] = [];
  shots.forEach((shot, i) => {
    const until = i + 1 < shots.length ? shots[i + 1].at : end;
    let ms = until - shot.at;
    const still = ms > 2 * frame ? stillTime(ticks, shot.at, until) : undefined;
    if (still !== undefined) ms = Math.min(ms, still + frame);
    const run = runs.at(-1);
    if (run?.hash === shot.hash) run.ms += ms;
    else runs.push({ file: shot.file, hash: shot.hash, ms });
  });
  return runs.map((run, i) => {
    let ms = run.ms;
    if (i === runs.length - 1) ms = Math.min(ms, holds.tail);
    else if (i === 0) ms = Math.min(ms, holds.lead);
    return { file: run.file, ms: Math.max(MIN_MS, Math.round(ms / TICK) * TICK) };
  });
}

/**
 * Thins a stream of frames to about one per `gap` ms, deciding on each as
 * the next arrives. Chrome's screencast sends one per repaint, up to 60 a
 * second: more than a GIF needs, and each kept frame costs its size. A
 * frame is kept if it came at least `gap` after the last one kept, or if it
 * stayed on screen at least `gap` (the next came that much later, or none
 * did): so the frame a movement settles on is never dropped, however soon
 * after the one before it came. push() takes each frame as it arrives and
 * returns the one before it if that one is kept; flush() returns the last.
 */
export function thinner<F extends { at: number }>(gap = 40): { push(frame: F): F | null; flush(): F | null } {
  let pending: F | null = null;
  let kept = -Infinity;
  const decide = (next: number) => {
    const frame = pending;
    if (!frame || (next - frame.at < gap && frame.at - kept < gap)) return null;
    kept = frame.at;
    return frame;
  };
  return {
    push(frame) {
      const done = decide(frame.at);
      pending = frame;
      return done;
    },
    flush() {
      const done = decide(Infinity);
      pending = null;
      return done;
    },
  };
}

/**
 * The timeline as an ffmpeg concat list, which gives each frame its own
 * duration. Each image is read at 100 frames a second, a GIF's hundredths:
 * at the image reader's default 25, every duration would snap to 40 ms
 * steps. The demuxer ignores the last entry's duration unless the file is
 * listed once more after it, so it is.
 */
export function concatList(stills: Still[]): string {
  const lines = ['ffconcat version 1.0'];
  const file = (name: string) => [`file '${name}'`, 'option framerate 100'];
  for (const { file: name, ms } of stills) lines.push(...file(name), `duration ${(ms / 1000).toFixed(3)}`);
  if (stills.length > 0) lines.push(...file(stills.at(-1)!.file));
  return `${lines.join('\n')}\n`;
}

/** A PNG's size in pixels, from its header. */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * The ffmpeg crop that cuts `clip` (CSS pixels) from a frame of the whole
 * viewport `scale` times its size (the device scale factor), whole pixels.
 */
export function cropFilter(clip: Clip, scale: number): string {
  const px = (n: number) => Math.round(n * scale);
  return `crop=${px(clip.width)}:${px(clip.height)}:${px(clip.x)}:${px(clip.y)}`;
}

/**
 * The height, in whole even pixels as ffmpeg's video wants, of a frame cut
 * by `crop` (a cropFilter) once scaled to `width`.
 */
export function scaledHeight(crop: string, width: number): number {
  const [w, h] = crop.replace('crop=', '').split(':').map(Number);
  return Math.max(2, Math.round((h * width) / w / 2) * 2);
}

/** A pointer position the overlay saw, at a time in ms. */
export interface Move { x: number; y: number; t: number }

/** The part of the viewport recorded, in CSS pixels. */
export interface Clip { x: number; y: number; width: number; height: number }

/** A stretch of the recording with the pointer still, outside the clip. */
export interface Rest { x: number; y: number; at: number; ms: number }

/**
 * Where the pointer sat still outside the recorded area for at least `min`
 * ms between `start` and `end`, so the GIF lost sight of it. Before its
 * first move the pointer is nowhere the overlay can draw, so that doesn't
 * count.
 */
export function restsOutside(moves: Move[], clip: Clip, start: number, end: number, min = 500): Rest[] {
  const inside = ({ x, y }: Move) =>
    x >= clip.x && x <= clip.x + clip.width && y >= clip.y && y <= clip.y + clip.height;
  const rests: Rest[] = [];
  moves.forEach((move, i) => {
    const from = Math.max(move.t, start);
    const to = Math.min(i + 1 < moves.length ? moves[i + 1].t : end, end);
    if (to - from >= min && !inside(move)) rests.push({ x: move.x, y: move.y, at: from - start, ms: to - from });
  });
  return rests;
}

/** The parts of a keydown the overlay names. */
export interface KeyPress { key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }

/**
 * How the overlay labels a key press: "Tab", "Shift+Tab", "→", "Space", a
 * character as typed ("c", "C", "?"), "Ctrl+K", "Ctrl+Shift+K". On its
 * own, a character already shows Shift (a capital, "?"), so it isn't named;
 * in a shortcut it is, and a letter is a capital, as shortcuts are written.
 * A modifier on its own names nothing: it shows with the key it modifies.
 * The overlay inlines this function's source, so it must stay
 * self-contained.
 */
export function keyLabel(e: KeyPress): string | null {
  const names: Record<string, string> = {
    ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc',
  };
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return null;
  const printable = e.key.length === 1 && e.key !== ' ';
  const chord = e.ctrlKey || e.altKey || e.metaKey;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.metaKey && 'Meta', e.shiftKey && (chord || !printable) && 'Shift'].filter(Boolean);
  const name = names[e.key] ?? (printable && chord ? e.key.toUpperCase() : e.key);
  return [...mods, name].join('+');
}
