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
