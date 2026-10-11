// The order a rulebook reader draws its pages in, the way pdf.js's own
// viewer picks (its PDFRenderingQueue): one worker draws every page, and a
// phone takes a second or more over a page full of images, so the pages
// that come near the screen together are drawn one at a time, those that
// matter most first, rather than all at once in page order, which finishes
// every one of them late.

/** Where a page's box is, in pixels from the top of the screen. */
export interface Place {
  top: number;
  bottom: number;
}

/** The order of the page a citation or a search asks for, which doesn't wait for a place. */
export const FIRST = -Infinity;

/** An order after every page on screen and before every page off it. */
export const OFF_SCREEN = 0;

/**
 * How soon to draw a page, lowest first: the page a citation or a search
 * asks for (`urgent`), then the pages on screen, the more of a page showing
 * the sooner, then the pages off screen, the nearer the sooner. `screen` is
 * the screen's height.
 */
export function drawOrder(place: Place, screen: number, urgent: boolean): number {
  if (urgent) return FIRST;
  const shown = Math.min(place.bottom, screen) - Math.max(place.top, 0);
  if (shown > 0) return -shown;
  return place.bottom <= 0 ? -place.bottom : place.top - screen;
}

/**
 * A page to draw: `order` says how soon (asked as a place frees up, since
 * pages move and a page can come to be asked for), `run` draws it and
 * settles once it is over, however it ends.
 */
export interface RenderJob {
  order: () => number;
  run: () => Promise<unknown>;
}

export interface RenderQueue {
  /** Adds a job; returns a call that takes it back out if it hasn't started. One that has is stopped by its own means, and its place goes to the next. */
  add: (job: RenderJob) => () => void;
  /** Starts what can start, in order: for a waiting job that has just been asked for. */
  next: () => void;
}

/**
 * Runs at most `limit` jobs at a time, the lowest order first, and beside
 * them one job of order FIRST at a time: the page asked for neither waits
 * for pages that weren't nor holds them up.
 */
export function renderQueue(limit: number): RenderQueue {
  const waiting: RenderJob[] = [];
  const running = { asked: 0, rest: 0 };
  // A job whose order can't be told (its page gone mid-unmount) goes after those on screen.
  const orderOf = (job: RenderJob) => {
    try {
      return job.order();
    } catch {
      return OFF_SCREEN;
    }
  };
  const next = () => {
    const orders = new Map(waiting.map((job) => [job, orderOf(job)]));
    // Compared rather than subtracted: FIRST less FIRST is no number.
    waiting.sort((a, b) => Math.sign(orders.get(a)! - orders.get(b)!) || 0);
    for (const job of [...waiting]) {
      const lane = orders.get(job) === FIRST ? 'asked' : 'rest';
      if (running[lane] >= (lane === 'asked' ? 1 : limit)) {
        // Another asked-for page is being drawn; the rest still may be.
        if (lane === 'asked') continue;
        return;
      }
      waiting.splice(waiting.indexOf(job), 1);
      running[lane]++;
      void Promise.resolve()
        .then(job.run)
        .catch(() => {})
        .finally(() => {
          running[lane]--;
          next();
        });
    }
  };
  return {
    add: (job) => {
      waiting.push(job);
      // After the rest of the pages that came near with it have been added.
      queueMicrotask(next);
      return () => {
        const at = waiting.indexOf(job);
        if (at >= 0) waiting.splice(at, 1);
      };
    },
    next,
  };
}
