import { test, expect } from './fixtures';

test('an unknown address shows the not-found page with a way home', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: 'This box is empty' })).toBeVisible();
  await expect(page.getByText('Unexpected Application Error')).toHaveCount(0);

  await page.getByRole('link', { name: 'Browse the collection' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Our Collection' })).toBeVisible();
});

test('rules for an unknown game say so and link home', async ({ page }) => {
  await page.goto('/rules/not-a-game');
  await expect(page.getByRole('heading', { level: 1, name: 'Game not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Browse the collection' })).toBeVisible();
});
