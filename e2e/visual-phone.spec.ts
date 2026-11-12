import { test, expect } from './fixtures';
import { LINKS, SIGN_IN, prepare, shoot } from './visual';

// What only a phone shows, on the iPhone (see visual.ts).
test('the filter sheet', async ({ page }) => {
  await prepare(page, 'light');
  await page.goto('/');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
  await shoot(page, 'filter-sheet-light');
});

// The emailed links' pages, opened on a phone more often than not, and the
// sign-in page, designed for one.
for (const scenario of [...LINKS, ...SIGN_IN]) {
  test(scenario.name, async ({ page }) => {
    await prepare(page, 'light');
    await scenario.open(page);
    await shoot(page, `${scenario.name}-light`);
  });
}
