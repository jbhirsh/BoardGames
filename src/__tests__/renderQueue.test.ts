import { describe, it, expect } from 'vitest';
import { drawOrder, FIRST, OFF_SCREEN, renderQueue, type RenderJob } from '../pdfjs/renderQueue';

const SCREEN = 800;

describe('drawOrder', () => {
  const order = (top: number, bottom: number, urgent = false) => drawOrder({ top, bottom }, SCREEN, urgent);

  it('puts a page asked for before everything, wherever it is', () => {
    expect(order(5000, 5500, true)).toBe(FIRST);
    expect(order(0, 800, true)).toBe(FIRST);
  });

  it('puts the pages on screen next, the more of a page showing the sooner', () => {
    const whole = order(100, 700);
    const most = order(-100, 500);
    const sliver = order(750, 1350);
    expect(whole).toBe(-600);
    expect(most).toBe(-500);
    expect(sliver).toBe(-50);
    // A page taller than the screen shows a screenful.
    expect(order(-200, 1200)).toBe(-800);
    expect(FIRST).toBeLessThan(whole);
  });

  it('puts the pages off screen last, the nearer the sooner, above or below', () => {
    expect(order(-700, -100)).toBe(100);
    expect(order(1000, 1600)).toBe(200);
    expect(order(-1000, -400)).toBe(400);
    // One just touching an edge shows nothing, and is right by it.
    expect(order(800, 1400)).toBe(0);
    expect(Math.abs(order(-600, 0))).toBe(0);
  });

  it('has a place for something after every page on screen and before every page off it', () => {
    expect(order(799, 1399)).toBeLessThan(OFF_SCREEN);
    expect(order(801, 1401)).toBeGreaterThan(OFF_SCREEN);
  });
});

/** A job of the given order whose run lasts until the test ends it, and the record of it. */
function job(name: string, order: number | (() => number), log: string[], live: Set<string>) {
  let end: (ok: boolean) => void = () => {};
  const j: RenderJob & { end: (ok?: boolean) => Promise<void> } = {
    order: typeof order === 'number' ? () => order : order,
    run: () => {
      log.push(name);
      live.add(name);
      return new Promise<void>((resolve, reject) => {
        end = (ok) => {
          live.delete(name);
          if (ok) resolve();
          else reject(new Error('failed'));
        };
      });
    },
    end: async (ok = true) => {
      end(ok);
      await settle();
    },
  };
  return j;
}

/** Lets the queue's promises run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('renderQueue', () => {
  it('runs the lowest order first, and no more at a time than its limit', async () => {
    const log: string[] = [];
    const live = new Set<string>();
    const queue = renderQueue(1);
    const jobs = new Map(([['below', 300], ['shown', -400], ['mostly shown', -600], ['above', 100]] as const).map(([name, order]) => [name, job(name, order, log, live)]));
    jobs.forEach((j) => queue.add(j));
    await settle();
    expect(log).toEqual(['mostly shown']);
    for (const name of ['mostly shown', 'shown', 'above', 'below'] as const) {
      expect([...live]).toEqual([name]);
      await jobs.get(name)!.end();
    }
    expect(log).toEqual(['mostly shown', 'shown', 'above', 'below']);
    expect(live.size).toBe(0);
  });

  it('keeps to a limit of two, starting the next as each place frees', async () => {
    const log: string[] = [];
    const live = new Set<string>();
    const queue = renderQueue(2);
    const [a, b, c] = [job('a', 1, log, live), job('b', 2, log, live), job('c', 3, log, live)];
    [c, b, a].forEach((j) => queue.add(j));
    await settle();
    expect(log).toEqual(['a', 'b']);
    expect(live.size).toBe(2);
    await b.end();
    expect(log).toEqual(['a', 'b', 'c']);
    expect(live.size).toBe(2);
  });

  it('asks each job its order as a place frees, since pages move', async () => {
    const log: string[] = [];
    const live = new Set<string>();
    const queue = renderQueue(1);
    let near = 500;
    const first = job('first', -100, log, live);
    queue.add(first);
    queue.add(job('far', 300, log, live));
    queue.add(job('moving', () => near, log, live));
    await settle();
    near = 50;
    await first.end();
    expect(log).toEqual(['first', 'moving']);
  });

  it('starts the page asked for at once, beside the one being drawn, and holds up nothing', async () => {
    const log: string[] = [];
    const live = new Set<string>();
    const queue = renderQueue(1);
    const shown = job('shown', -500, log, live);
    queue.add(shown);
    await settle();
    const cited = job('cited', FIRST, log, live);
    queue.add(cited);
    queue.add(job('next', -100, log, live));
    await settle();
    expect(log).toEqual(['shown', 'cited']);
    // The page asked for keeps its own place: the rest go on in theirs.
    await shown.end();
    expect(log).toEqual(['shown', 'cited', 'next']);
    expect([...live].sort()).toEqual(['cited', 'next']);
  });

  it('draws one page asked for at a time, and lets the rest go by meanwhile', async () => {
    const log: string[] = [];
    const live = new Set<string>();
    const queue = renderQueue(1);
    const cited = job('cited', FIRST, log, live);
    const match = job('match', FIRST, log, live);
    queue.add(cited);
    queue.add(match);
    queue.add(job('shown', -100, log, live));
    await settle();
    expect(log).toEqual(['cited', 'shown']);
    await cited.end();
    expect(log).toEqual(['cited', 'shown', 'match']);
    expect(live.size).toBe(2);
  });

  it('draws one page asked for at a time however many places the rest have', async () => {
    const log: string[] = [];
    const live = new Set<string>();
    const queue = renderQueue(2);
    const cited = job('cited', FIRST, log, live);
    queue.add(cited);
    queue.add(job('match', FIRST, log, live));
    await settle();
    expect(log).toEqual(['cited']);
    await cited.end();
    expect(log).toEqual(['cited', 'match']);
  });

  it('starts a waiting job when it is asked for', async () => {
    const log: string[] = [];
    const live = new Set<string>();
    const queue = renderQueue(1);
    let asked = false;
    queue.add(job('shown', -100, log, live));
    queue.add(job('waiting', () => (asked ? FIRST : 400), log, live));
    await settle();
    expect(log).toEqual(['shown']);
    asked = true;
    queue.next();
    await settle();
    expect(log).toEqual(['shown', 'waiting']);
  });

  it('runs no job taken back out before it started', async () => {
    const log: string[] = [];
    const live = new Set<string>();
    const queue = renderQueue(1);
    const first = job('first', 1, log, live);
    queue.add(first);
    const remove = queue.add(job('gone', 2, log, live));
    queue.add(job('kept', 3, log, live));
    await settle();
    remove();
    // Twice is harmless.
    remove();
    await first.end();
    expect(log).toEqual(['first', 'kept']);
  });

  it('puts a job whose order can\'t be told after the pages on screen, and goes on', async () => {
    const log: string[] = [];
    const live = new Set<string>();
    const queue = renderQueue(1);
    const first = job('first', -500, log, live);
    queue.add(first);
    // Its page gone mid-unmount, before its job is taken out.
    queue.add(job('gone', () => { throw new Error('no page'); }, log, live));
    queue.add(job('shown', -100, log, live));
    queue.add(job('below', 100, log, live));
    await settle();
    await first.end();
    expect(log).toEqual(['first', 'shown']);
    await settle();
    expect(live).toEqual(new Set(['shown']));
  });

  it('frees the place of a job that fails, or that throws before it starts', async () => {
    const log: string[] = [];
    const live = new Set<string>();
    const queue = renderQueue(1);
    const failing = job('failing', 1, log, live);
    queue.add(failing);
    queue.add({ order: () => 2, run: () => { log.push('throws'); throw new Error('no page'); } });
    queue.add(job('after', 3, log, live));
    await settle();
    await failing.end(false);
    expect(log).toEqual(['failing', 'throws', 'after']);
  });
});
