import { test, expect } from './fixtures';
import { GAMES_STATES, LINKS, SIGN_IN, prepare, shoot } from './visual';

// What only a phone shows, on the iPhone (see visual.ts).
test('the filter sheet', async ({ page }) => {
  await prepare(page, 'light');
  await page.goto('/');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
  await shoot(page, 'filter-sheet-light');
});

// The emailed links' pages, opened on a phone more often than not, the
// sign-in page, designed for one, and the games query's states, which a
// phone's lines and cards show their own way.
for (const scenario of [...LINKS, ...SIGN_IN, ...GAMES_STATES]) {
  test(scenario.name, async ({ page }) => {
    await prepare(page, 'light');
    await scenario.open(page);
    await shoot(page, `${scenario.name}-light`);
  });
}
