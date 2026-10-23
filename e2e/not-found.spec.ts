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

// A deploy since the tab loaded: the page's code it names is gone (404).
const SCORE_CODE = /\/assets\/ScoreCalculatorPage-[^/]+\.js$/;

test('a page whose code is gone since the tab loaded reloads once and opens', async ({ page }) => {
  let asked = 0;
  await page.route(SCORE_CODE, (route) =>
    ++asked === 1 ? route.fulfill({ status: 404, body: 'Not found' }) : route.fallback(),
  );
  await page.goto('/rules/7-wonders');
  await page.getByRole('link', { name: 'Score calculator' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Score Calculator', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/score\/7-wonders$/);
  expect(asked).toBe(2);
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
});

test('a page whose code never loads says so after one reload, not a loop', async ({ page }) => {
  let asked = 0;
  await page.route(SCORE_CODE, (route) => {
    asked++;
    return route.fulfill({ status: 404, body: 'Not found' });
  });
  await page.goto('/rules/7-wonders');
  await page.getByRole('link', { name: 'Score calculator' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible();
  expect(asked).toBe(2);
});
