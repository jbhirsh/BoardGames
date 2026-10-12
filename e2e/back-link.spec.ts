import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

/** Every game row in the visible list carries a "Show details for <name>" toggle. */
const rowToggles = /^Show details for /;

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

/** Starts noting every offset the page scrolls through; read them with `scrolledThrough`. */
async function noteScrolling(page: Page) {
  await page.evaluate(() => {
    const seen: number[] = [];
    Object.assign(window, { scrolledThrough: seen });
    window.addEventListener('scroll', () => seen.push(window.scrollY));
  });
}
const scrolledThrough = (page: Page) =>
  page.evaluate(() => (window as unknown as { scrolledThrough: number[] }).scrolledThrough);

test('Back from a rules page returns to the filtered list where it was left', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Players', exact: true }).click();
  await page.getByRole('radio', { name: '2 players' }).click();
  await expect(page).toHaveURL(/\/\?p=2$/);
  const count = await page.getByRole('button', { name: rowToggles }).count();
  await expect(page.getByText(`${count} games`, { exact: true })).toBeVisible();

  // Dominion sits well down the list, so coming back at the top would hide it.
  const dominion = page.getByRole('button', { name: /^(Show|Hide) details for Dominion$/ });
  await dominion.click();
  // Scrolled by hand until its add-on's link shows with the game still in
  // view, as a visitor would, so the click needn't scroll the page itself.
  const intrigue = page.getByRole('link', { name: 'Intrigue rules' });
  await page.mouse.wheel(0, 200);
  await expect(intrigue).toBeInViewport();
  await expect(dominion).toBeInViewport();
  await intrigue.click();
  await expect(page).toHaveURL(/\/rules\/dominion\/intrigue$/);

  // Reading another tab doesn't add a step between the page and the list.
  await page.getByRole('navigation', { name: 'Rulebooks' }).getByRole('link', { name: 'Base game' }).click();
  await expect(page).toHaveURL(/\/rules\/dominion$/);

  await noteScrolling(page);
  await page.getByRole('link', { name: /Back to The Game Room/ }).click();

  await expect(page).toHaveURL(/\/\?p=2$/);
  await expect(page.getByRole('button', { name: '2 players', exact: true })).toBeVisible();
  await expect(page.getByText(`${count} games`, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: rowToggles })).toHaveCount(count);
  await expect(dominion).toBeInViewport();
  await expect(page.getByRole('heading', { level: 1, name: 'Our Game Room' })).not.toBeInViewport();
  // Put back in one jump, not a glide down from the top past the rows above.
  const at = await scrollY(page);
  expect(at).toBeGreaterThan(0);
  expect(await scrolledThrough(page)).toEqual([at]);
});

test('Back from the picked game\'s rules returns to the list where it was', async ({ page }) => {
  await page.goto('/?p=2');
  await expect(page.getByRole('button', { name: rowToggles }).first()).toBeVisible();
  // Scrolled down the list, then back up just far enough to reach the button.
  await page.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' }));
  // Instant, not Playwright's own scrolling, which html{scroll-behavior:smooth}
  // turns into a glide still moving when the offset is read.
  const pick = page.getByRole('button', { name: 'Pick for us' });
  await pick.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const left = await scrollY(page);
  expect(left).toBeGreaterThan(0);

  await pick.click();
  await page.getByRole('dialog').getByRole('button', { name: 'View rules' }).click();
  await expect(page).toHaveURL(/\/rules\//);

  await page.getByRole('link', { name: /Back to The Game Room/ }).click();

  await expect(page).toHaveURL(/\/\?p=2$/);
  // Not the top of the list, which is where the open picker's pinned page
  // used to say it was.
  await expect.poll(() => scrollY(page)).toBe(left);
});

test('a collapsed list row carries no Rules link, on a desktop or the narrow list', async ({ page }) => {
  for (const width of [1280, 640]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Show details for Pandemic' }) });
    await expect(row).toBeVisible();
    // Only the chevron: Rules lives at the end of the open row.
    await expect(row.getByRole('link')).toHaveCount(0);
  }
});

test('the open row\'s Rules, at the end of its write-up on the right, opens the rules page, and Back returns to the list', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /^(Show|Hide) details for Pandemic$/ });
  await toggle.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // The panel is the cell spanning the table under the row; its Rules is the
  // filled one, after the write-up and over on the right.
  const panel = page.getByRole('cell').filter({ has: page.getByRole('link', { name: 'Watch Pandemic tutorial on YouTube' }) });
  const rules = panel.getByRole('link', { name: 'Rules for Pandemic' });
  await rules.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect(rules).toBeInViewport();
  const lastHeading = await panel.getByRole('heading', { name: 'Difficulty and Legacy' }).boundingBox();
  const rulesBox = await rules.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(rulesBox!.y).toBeGreaterThan(lastHeading!.y + lastHeading!.height);
  expect(rulesBox!.x).toBeGreaterThan(panelBox!.x + panelBox!.width / 2);
  const left = await scrollY(page);
  expect(left).toBeGreaterThan(0);
  await rules.click();
  await expect(page).toHaveURL(/\/rules\/pandemic$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Pandemic' })).toBeVisible();

  await page.getByRole('link', { name: /Back to The Game Room/ }).click();

  await expect(page).toHaveURL(/\/$/);
  // Where the list was left, not its top (the row itself comes back shut).
  await expect.poll(() => scrollY(page)).toBe(left);
  await expect(page.getByRole('heading', { level: 1, name: 'Our Game Room' })).not.toBeInViewport();
});

test('Back from a rules page opened directly goes to the whole collection', async ({ page }) => {
  // A filtered list earlier in the tab's history isn't where a deep link came from.
  await page.goto('/?p=2');
  await page.goto('/rules/dominion');

  await page.getByRole('link', { name: /Back to The Game Room/ }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Our Game Room' })).toBeInViewport();
  await expect(page.getByRole('button', { name: '2 players', exact: true })).toHaveCount(0);
});
