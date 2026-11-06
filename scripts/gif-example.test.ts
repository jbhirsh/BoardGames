import { describe, expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';
import type { Gif, Point, Target } from './gif-types.ts';
import example from './gif-scenarios/example.ts';

const WIDTH = 402;

/** A page and gif that log every call, in order, with the carousel's row at `row`. */
function fakes(row = { x: 0, y: 300, width: WIDTH, height: 200 }) {
  const log: unknown[][] = [];
  const record =
    (name: string, result?: unknown) =>
    (...args: unknown[]) => {
      log.push([name, ...args]);
      return Promise.resolve(result);
    };
  const covers = { boundingBox: vi.fn(() => Promise.resolve(row)), waitFor: record('covers.waitFor') };
  const search = { name: 'search box' };
  const page = {
    getByRole: vi.fn(() => covers),
    getByPlaceholder: vi.fn(() => search),
    viewportSize: () => ({ width: WIDTH, height: 874 }),
    waitForTimeout: record('wait'),
    keyboard: { type: record('type'), press: record('press') },
  };
  const at =
    (name: string) =>
    (_page: Page, target: Target): Promise<Point> => {
      log.push([name, target]);
      return Promise.resolve({ x: 0, y: 0 });
    };
  const gif: Gif = {
    glide: vi.fn(at('glide')),
    click: vi.fn(at('click')),
    drag: vi.fn((_page: Page, from: Target, to: Target) => {
      log.push(['drag', from, to]);
      return Promise.resolve();
    }),
    scroll: vi.fn(() => Promise.reject(new Error('the example never scrolls'))),
    side: 'after',
    origin: 'http://127.0.0.1:4192',
  };
  return { page: page as unknown as Page, gif, log, covers, search };
}

describe('the example scenario', () => {
  it('opens on the home page', () => {
    expect(example.path).toBe('/');
  });

  it('clips to the carousel, the window wide, with room for the pointer above and below', async () => {
    const { page } = fakes();
    const clip = example.clip;

    expect(await clip(page)).toEqual({ x: 0, y: 255, width: WIDTH, height: 365 });
    expect(page.getByRole).toHaveBeenCalledWith('list', { name: 'Collection covers' });
    // A row near the top is clipped from the page's top, never above it.
    expect(await clip(fakes({ x: 0, y: 20, width: WIDTH, height: 200 }).page)).toMatchObject({ y: 0 });
  });

  it('is ready once the carousel is there', async () => {
    const { page, log } = fakes();

    await example.ready(page);

    expect(log).toEqual([['covers.waitFor']]);
  });

  it('drags the carousel right and lets go, then types a search and Tabs out', async () => {
    const { page, gif, log, search } = fakes();
    // The row's middle, and the rest point under it.
    const y = 400;
    const rest = { x: WIDTH / 2, y: 530 };

    await example.play(page, gif);

    expect(log).toEqual([
      ['glide', rest],
      ['wait', 1200],
      ['drag', { x: WIDTH * 0.25, y }, { x: WIDTH * 0.75, y }],
      ['glide', rest],
      ['wait', 2500],
      ['click', search],
      ['type', 'cat', { delay: 350 }],
      ['wait', 900],
      ['press', 'Tab'],
      ['wait', 1500],
    ]);
    expect(page.getByPlaceholder).toHaveBeenCalledWith('Search games...');
    for (const move of [gif.glide, gif.click, gif.drag]) {
      expect(vi.mocked(move).mock.calls.every(([on]) => on === page)).toBe(true);
    }
    expect(gif.scroll).not.toHaveBeenCalled();
  });
});
