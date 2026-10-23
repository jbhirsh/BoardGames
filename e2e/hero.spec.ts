import type { Locator, Page } from '@playwright/test';
import { GAMES } from '../src/data/games';
import { test, expect } from './fixtures';

/** The row of covers; its parent is the moving track that holds both copies. */
function track(page: Page): Locator {
  return page.getByRole('list', { name: 'Collection covers' });
}

/** How far the row has slid, from the track's computed transform. */
function slid(row: Locator): Promise<number> {
  return row.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el.parentElement!).transform).m41);
}

/** The reel animation's play state ('running' or 'paused'). */
function playState(row: Locator): Promise<string | undefined> {
  return row.evaluate((el) => el.parentElement!.getAnimations()[0]?.playState);
}

/** Whether the reel has come to rest: paused, and no longer waiting for a frame to stop on. */
function atRest(row: Locator): Promise<boolean> {
  return row.evaluate((el) => {
    const anim = el.parentElement!.getAnimations()[0];
    return anim.playState === 'paused' && !anim.pending;
  });
}

test('the hero\'s covers glide sideways, and stop when paused', async ({ page }) => {
  await page.goto('/');
  const row = track(page);
  // Every game once to a screen reader; the loop's second copy is hidden.
  await expect(page.getByRole('list', { name: 'Collection covers' }).getByRole('button')).toHaveCount(GAMES.length);
  await expect(page.getByRole('button', { name: 'Show Catan in the list' })).toHaveCount(1);

  const start = await slid(row);
  await expect.poll(() => slid(row)).toBeLessThan(start - 1);
  expect(await playState(row)).toBe('running');

  await page.getByRole('button', { name: 'Pause cover carousel' }).click();
  // Away from the row, so it isn't hover that holds it.
  await page.mouse.move(0, 0);
  await expect.poll(() => playState(row)).toBe('paused');
  const held = await slid(row);
  await expect(page.getByRole('button', { name: 'Play cover carousel' })).toBeVisible();
  expect(await slid(row)).toBe(held);

  await page.getByRole('button', { name: 'Play cover carousel' }).click();
  await page.mouse.move(0, 0);
  await expect.poll(() => playState(row)).toBe('running');
  await expect.poll(() => slid(row)).toBeLessThan(held - 1);
});

test('the row holds still under the pointer', async ({ page }) => {
  await page.goto('/');
  const row = track(page);
  // The pointer moved over a cover by hand: hover() waits for it to stop
  // moving, which only the hover itself would do.
  const box = (await page.getByRole('button', { name: 'Show Azul in the list' }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => playState(row)).toBe('paused');
});

test('only a cover holds the row still, not the gaps or the room round it', async ({ page }) => {
  await page.goto('/');
  const row = track(page);
  const covers = row.getByRole('button');
  // Wound to its start and slowed to a standstill, so the covers stay where
  // they were measured; the play state still follows the stylesheet.
  await row.evaluate((el) => {
    const anim = el.parentElement!.getAnimations()[0];
    anim.playbackRate = 0;
    anim.currentTime = 0;
  });
  const a = (await covers.nth(5).boundingBox())!;
  const b = (await covers.nth(6).boundingBox())!;
  const x = a.x + a.width / 2;
  const y = a.y + a.height / 2;

  await page.mouse.move(x, y);
  await expect.poll(() => playState(row)).toBe('paused');
  // The gap between two covers.
  await page.mouse.move((a.x + a.width + b.x) / 2, y);
  await expect.poll(() => playState(row)).toBe('running');
  // Just above the row and just under it, in the room for the lift and
  // the shadows.
  await page.mouse.move(x, a.y - 6);
  expect(await playState(row)).toBe('running');
  await page.mouse.move(x, a.y + a.height + 12);
  expect(await playState(row)).toBe('running');
  // A cover's bottom edge, which its hover lift rises off: still held.
  await page.mouse.move(x, a.y + a.height - 1);
  await expect.poll(() => playState(row)).toBe('paused');
});

test('the row drags sideways, and the drag doesn\'t open a game', async ({ page }) => {
  await page.goto('/');
  const row = track(page);
  const cover = row.getByRole('button').nth(4);
  const name = (await cover.getAttribute('title'))!;
  const start = (await cover.boundingBox())!;
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  await page.mouse.move(x, y);
  // Where the cover came to rest under the pointer, a little on from
  // where it was found.
  await expect.poll(() => atRest(row)).toBe(true);
  const from = (await cover.boundingBox())!;

  await page.mouse.down();
  await page.mouse.move(x - 150, y, { steps: 10 });
  const to = (await cover.boundingBox())!;
  expect(to.x).toBeCloseTo(from.x - 150, 0);
  await page.mouse.up();
  const listed = page.getByRole('button', { name: `Show details for ${name}` });
  await expect(listed).not.toBeInViewport();
  await expect(listed).not.toBeFocused();

  // Let go and pointed away, it glides on from where it was left.
  await page.mouse.move(0, 0);
  await expect.poll(() => playState(row)).toBe('running');
  await expect.poll(async () => (await cover.boundingBox())!.x).toBeLessThan(to.x - 1);
});

test('pulled right, the row turns to glide right, coming round its loop', async ({ page }) => {
  await page.goto('/');
  const row = track(page);
  const at = (ms: number) => row.evaluate((el, t) => {
    el.parentElement!.getAnimations()[0].currentTime = t;
  }, ms);
  // Between finishing and being wound round, the row has no animation for
  // a frame: no time, which the poll waits out.
  const time = () => row.evaluate((el) => Number(el.parentElement!.getAnimations()[0]?.currentTime));
  const lap = await row.evaluate((el) => Number(el.parentElement!.getAnimations()[0].effect!.getComputedTiming().duration));
  // The middle of the row, whatever is under it: pressed, the row holds.
  const cover = (await row.getByRole('button').first().boundingBox())!;
  const x = page.viewportSize()!.width / 2;
  const y = cover.y + cover.height / 2;
  // Pulls the row 150px from where it is wound to, and lets go of it
  // with the pointer away. Wound well inside the lap, the row can't come
  // round its loop while it is watched.
  const pull = async (from: number, by: number) => {
    await at(from);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect.poll(() => atRest(row)).toBe(true);
    const held = await slid(row);
    await page.mouse.move(x + by, y, { steps: 10 });
    expect(await slid(row)).toBeCloseTo(held + by, 0);
    const left = await slid(row);
    await page.mouse.up();
    await page.mouse.move(0, 0);
    await expect.poll(() => playState(row)).toBe('running');
    return left;
  };

  const right = await pull(lap / 3, 150);
  await expect.poll(() => slid(row)).toBeGreaterThan(right + 1);

  // Played back to the start of its first lap, it comes round to the end
  // of the lap and carries on, rather than finishing there.
  await at(50);
  await expect.poll(time).toBeGreaterThan(lap / 2);
  expect(await playState(row)).toBe('running');
  const after = await slid(row);
  await expect.poll(() => slid(row)).toBeGreaterThan(after + 1);

  // Pulled left again, it turns back.
  const left = await pull(lap / 3, -150);
  await expect.poll(() => slid(row)).toBeLessThan(left - 1);
});

test('a press on a cover that doesn\'t move still opens its game', async ({ page }) => {
  await page.goto('/');
  const row = track(page);
  const cover = row.getByRole('button').nth(4);
  const name = (await cover.getAttribute('title'))!;
  const box = (await cover.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => playState(row)).toBe('paused');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: `Show details for ${name}` })).toBeFocused();
});

test('clicking a cover brings its game\'s row into view, ready for the keyboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pause cover carousel' }).click();
  await page.getByRole('button', { name: 'Show Azul in the list' }).click();
  const toggle = page.getByRole('button', { name: 'Show details for Azul' });
  await expect(toggle).toBeInViewport();
  await expect(toggle).toBeFocused();
});

test('a cover Tabbed to and pressed brings its game\'s card into view', async ({ page }) => {
  await page.goto('/?v=grid');
  const cover = page.getByRole('button', { name: 'Show Codenames in the list' });
  await cover.focus();
  await expect.poll(() => playState(track(page))).toBe('paused');
  await expect(cover).toBeInViewport();
  await page.keyboard.press('Enter');
  const name = page.getByRole('heading', { level: 3, name: 'Codenames' });
  await expect(name).toBeInViewport();
  await expect(name).toBeFocused();
});

test('the row is one Tab stop after its pause button, with arrow keys between covers', async ({ page }) => {
  await page.goto('/');
  const row = track(page);
  const covers = row.getByRole('button');
  await page.getByRole('button', { name: 'Pause cover carousel' }).focus();
  await page.keyboard.press('Tab');
  await expect(covers.first()).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  // Wrapped round to the last cover, which the row winds into view.
  await expect(covers.last()).toBeFocused();
  await expect(covers.last()).toBeInViewport();
  await page.keyboard.press('Tab');
  // Out of the row in one step, not thirty.
  expect(await row.evaluate((el) => el.contains(document.activeElement))).toBe(false);
  await page.keyboard.press('Shift+Tab');
  await expect(covers.last()).toBeFocused();
});

/** The covers wearing a focus ring inside the row's visible stretch, by name, from either copy. */
function ringsOnScreen(row: Locator): Promise<(string | null)[]> {
  return row.evaluate((el) => {
    const view = el.closest('.hero-reel-view')!.getBoundingClientRect();
    return [...el.parentElement!.querySelectorAll('button')]
      .filter((b) => {
        const box = b.getBoundingClientRect();
        const middle = box.left + box.width / 2;
        return getComputedStyle(b).outlineStyle !== 'none' && middle > view.left && middle < view.right;
      })
      .map((b) => b.getAttribute('aria-label'));
  });
}

test('the cover the keyboard is on shows its ring on screen, at the start of the list too', async ({ page }) => {
  await page.goto('/');
  const row = track(page);
  const covers = row.getByRole('button');
  // The ring on screen is the focused cover's, and no other.
  const ringOn = async (i: number) => {
    await expect(covers.nth(i)).toBeFocused();
    const name = await covers.nth(i).getAttribute('aria-label');
    await expect.poll(() => ringsOnScreen(row)).toEqual([name]);
  };
  await page.getByRole('button', { name: 'Pause cover carousel' }).focus();
  await page.keyboard.press('Tab');
  await ringOn(0);
  // The first few can't themselves be brought to the middle (the row only
  // slides left), so their twins are, and wear the ring; those after can.
  for (let i = 1; i < 6; i++) {
    await page.keyboard.press('ArrowRight');
    await ringOn(i);
  }
});

test('a cover whose game the filters hide clears them to show it', async ({ page }) => {
  await page.goto('/?q=catan');
  await page.getByRole('button', { name: 'Pause cover carousel' }).click();
  await page.getByRole('button', { name: 'Show Azul in the list' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Show details for Azul' })).toBeInViewport();
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the covers stand still in a row of favourites, with nothing to pause', async ({ page }) => {
    await page.goto('/');
    const row = track(page);
    await expect(page.getByRole('list', { name: 'Collection covers' }).getByRole('button')).toHaveCount(7);
    await expect(page.getByRole('button', { name: /cover carousel/ })).toHaveCount(0);
    expect(await playState(row)).toBeUndefined();
    expect(await slid(row)).toBe(0);
  });
});
