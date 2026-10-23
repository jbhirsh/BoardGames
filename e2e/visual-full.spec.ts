import { test, expect } from './fixtures';
import { CORE, MORE, prepare, shoot } from './visual';

// Every state in both themes, in desktop Chromium (see visual.ts), which
// covers every style the app has.
for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    for (const scenario of MORE) {
      test(scenario.name, async ({ page }) => {
        await prepare(page, theme);
        await scenario.open(page);
        await shoot(page, `${scenario.name}-${theme}`);
      });
    }

    // The core pages in the dark theme; visual.spec.ts has them light.
    if (theme === 'dark') {
      for (const scenario of CORE) {
        test(scenario.name, async ({ page }) => {
          await prepare(page, theme);
          await scenario.open(page);
          await shoot(page, `${scenario.name}-${theme}`);
        });
      }
    }

    // Every row and card, top to bottom.
    for (const [name, url] of [
      ['home-list-whole', '/'],
      ['home-grid-whole', '/?v=grid'],
      ['wishlist-whole', '/?c=want'],
    ] as const) {
      test(name, async ({ page }) => {
        await prepare(page, theme);
        await page.goto(url);
        await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
        await shoot(page, `${name}-${theme}`, true);
      });
    }
  });
}

test("the toggle's dark theme", async ({ page }) => {
  await prepare(page, 'light');
  await page.goto('/');
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await shoot(page, 'home-toggled-dark');
});
