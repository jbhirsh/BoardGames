import { test, expect } from './fixtures';
import { LINKS, prepare, shoot } from './visual';

// What only a phone shows, on the phone projects (see visual.ts).
test('the filter sheet', async ({ page }) => {
  await prepare(page, 'light');
  await page.goto('/');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
  await shoot(page, 'filter-sheet-light');
});

// The emailed links' pages, opened on a phone more often than not.
for (const scenario of LINKS) {
  test(scenario.name, async ({ page }) => {
    await prepare(page, 'light');
    await scenario.open(page);
    await shoot(page, `${scenario.name}-light`);
  });
}
