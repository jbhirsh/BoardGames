import { createRequire } from 'node:module';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/** The page's background colour, as the browser paints it. */
const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const LIGHT = 'rgb(251, 251, 253)';
const DARK = 'rgb(17, 17, 19)';

test('follows the system\'s dark setting with nothing picked', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('radio', { name: 'Match system' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => background(page)).toBe(DARK);
});

test('a picked theme wins over the system\'s and is there from the first paint next time', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect.poll(() => background(page)).toBe(LIGHT);

  // Before any app code runs on the next load, the stored choice is on <html>.
  await page.reload({ waitUntil: 'commit' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await expect(page.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => background(page)).toBe(LIGHT);

  // And a page without the toggle keeps it.
  await page.goto('/score/7-wonders');
  await expect.poll(() => background(page)).toBe(LIGHT);
});

for (const width of [390, 700, 1280]) {
  test(`the theme toggle stays clear of the title at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const toggle = (await page.getByRole('radiogroup', { name: 'Colour theme' }).boundingBox())!;
    // The title's text, not its full-width block, is what the toggle must miss.
    const title = await page.getByRole('heading', { level: 1 }).evaluate((h1) => {
      const range = document.createRange();
      range.selectNodeContents(h1);
      const { left, right, top, bottom } = range.getBoundingClientRect();
      return { left, right, top, bottom };
    });
    const apart = toggle.y + toggle.height <= title.top || toggle.x >= title.right || toggle.x + toggle.width <= title.left;
    expect(apart, JSON.stringify({ toggle, title })).toBe(true);
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`text keeps a readable contrast in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const url of ['/', '/?v=grid', '/?c=want', '/rules/hogwarts-battle', '/score/7-wonders', '/word-checker']) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.addScriptTag({ path: axePath });
      const failures = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { nodes: { target: string[] }[] }[] }> } }).axe;
        const result = await axe.run(document, { runOnly: ['color-contrast'] });
        return result.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')));
      });
      expect(failures, url).toEqual([]);
    }
  });
}
