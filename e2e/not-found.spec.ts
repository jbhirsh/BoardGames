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

// A deploy since the tab loaded: the code the tab's entry names for the
// score page is gone (404), and a reload fetches an entry naming the code the
// server has now. Each load of the entry is counted, as each is a load of
// the page. WebKit, Safari's engine, never asks again in the same tab for a
// module that once failed, so the first entry is served naming a chunk that
// is gone, as a deploy's old entry does, rather than the chunk failing once.
const ENTRY = /\/assets\/index-[^/]+\.js$/;
const SCORE_CODE = /\/assets\/ScoreCalculatorPage-[^/]+\.js$/;
const GONE = 'ScoreCalculatorPage-gone-';

test('a page whose code is gone since the tab loaded reloads once and opens', async ({ page }) => {
  let loads = 0;
  await page.route(ENTRY, async (route) => {
    if (++loads > 1) return route.fallback();
    const response = await route.fetch();
    const body = (await response.text()).replaceAll('ScoreCalculatorPage-', GONE);
    return route.fulfill({ response, body });
  });
  await page.route(SCORE_CODE, (route) =>
    route.request().url().includes(GONE) ? route.fulfill({ status: 404, body: 'Not found' }) : route.fallback(),
  );
  await page.goto('/rules/7-wonders');
  await page.getByRole('link', { name: 'Score calculator' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Score Calculator', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/score\/7-wonders$/);
  expect(loads).toBe(2);
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
});

test('a page whose code never loads says so after one reload, not a loop', async ({ page }) => {
  let loads = 0;
  await page.route(ENTRY, (route) => {
    loads++;
    return route.fallback();
  });
  await page.route(SCORE_CODE, (route) => route.fulfill({ status: 404, body: 'Not found' }));
  await page.goto('/rules/7-wonders');
  await page.getByRole('link', { name: 'Score calculator' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible();
  expect(loads).toBe(2);
});
