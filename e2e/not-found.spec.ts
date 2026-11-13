import type { Page } from '@playwright/test';
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
// server has now. Each load of the page is counted, by its navigations: not
// by fetches of the entry, which a page may fetch twice (its own load, then a
// lazy page's code importing from it, which a busy WebKit sends again rather
// than take from its cache). WebKit, Safari's engine, never asks again in the
// same tab for a module that once failed, so the first entry is served naming
// a chunk that is gone, as a deploy's old entry does, rather than the chunk
// failing once.
const ENTRY = /\/assets\/index-[^/]+\.js$/;
const SCORE_CODE = /\/assets\/ScoreCalculatorPage-[^/]+\.js$/;
const GONE = 'ScoreCalculatorPage-gone-';

/** Counts the page's loads: each navigation of its main frame, a reload included. */
function countLoads(page: Page) {
  const count = { loads: 0 };
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) count.loads++;
  });
  return count;
}

test('a page whose code is gone since the tab loaded reloads once and opens', async ({ page }) => {
  const count = countLoads(page);
  // The first fetch of the entry names the chunk that is gone; a later one,
  // the page's own or the reload's, is the real one.
  let rewritten = false;
  await page.route(ENTRY, async (route) => {
    if (rewritten) return route.fallback();
    rewritten = true;
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
  expect(count.loads).toBe(2);
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
});

test('a page whose code never loads says so after one reload, not a loop', async ({ page }) => {
  const count = countLoads(page);
  await page.route(SCORE_CODE, (route) => route.fulfill({ status: 404, body: 'Not found' }));
  await page.goto('/rules/7-wonders');
  await page.getByRole('link', { name: 'Score calculator' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible();
  expect(count.loads).toBe(2);
});
