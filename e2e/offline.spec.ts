import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

// The service worker (src/sw/sw.ts) is blocked for every other spec.
test.use({ serviceWorkers: 'allow' });

/** Waits until the service worker has installed and controls the page. */
async function controlled(page: Page) {
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

/** Waits until a rulebook opened while online is saved for offline. */
async function saved(page: Page, pdf: string) {
  await expect.poll(() => page.evaluate(async (path) => (await caches.match(path)) !== undefined, pdf)).toBe(true);
}

test('the installed site lists the collection and checks words with no network', async ({ page, context }) => {
  await page.goto('/');
  await controlled(page);
  // Box art opened in its own tab is a page too, and must not stand in for
  // the app.
  await page.goto('/images/catan.webp');
  await context.setOffline(true);

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Our Collection' })).toBeVisible();
  // Box art, saved at install: the hero's Catan box drew.
  const box = page.getByRole('link', { name: 'Catan rules' });
  await expect.poll(() => box.evaluate((link) => link.querySelector('img')?.naturalWidth ?? 0)).toBeGreaterThan(0);

  // A page not opened yet still loads: every page is the same saved app.
  await page.goto('/word-checker');
  await page.getByPlaceholder('Enter a word...').fill('banana');
  await page.getByRole('button', { name: 'Check' }).click();
  // The dictionary is out of reach; the saved word list answers.
  await expect(page.getByText('Valid word', { exact: true })).toBeVisible();

  // So does the saved list of newer words ENABLE predates.
  await page.getByPlaceholder('Enter a word...').fill('qi');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('qi', { exact: true })).toBeVisible();
  await expect(page.getByText('Valid word', { exact: true })).toBeVisible();
});

test('a rulebook opened once reads on a phone with no network', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/rules/azul');
  await controlled(page);
  // The first open came before the worker was in charge; open it again so
  // the worker sees it and saves the whole file.
  await page.reload();
  const reader = page.getByRole('region', { name: 'Azul rules' });
  await expect(reader.getByRole('button', { name: 'Search' })).toBeEnabled();
  await saved(page, '/rules/azul.pdf');

  await context.setOffline(true);
  await page.reload();
  await reader.getByRole('searchbox', { name: 'Search the rulebook' }).fill('factory display');
  await reader.getByRole('button', { name: 'Search' }).click();
  await expect(reader.getByRole('status')).toHaveText(/^1 of \d+ · page \d+$/);
});

test('the saved rulebook answers byte ranges the way the server does', async ({ page }) => {
  await page.goto('/rules/azul');
  await controlled(page);
  await page.reload();
  await saved(page, '/rules/azul.pdf');

  const answer = await page.evaluate(async () => {
    const part = await fetch('/rules/azul.pdf', { headers: { Range: 'bytes=0-4' } });
    const head = await fetch('/rules/azul.pdf', { method: 'HEAD' });
    const past = await fetch('/rules/azul.pdf', { headers: { Range: 'bytes=999999999-' } });
    return {
      status: part.status,
      range: part.headers.get('Content-Range'),
      text: await part.text(),
      size: head.headers.get('Content-Length'),
      past: past.status,
    };
  });
  expect(answer.status).toBe(206);
  expect(answer.text).toBe('%PDF-');
  expect(answer.range).toBe(`bytes 0-4/${answer.size}`);
  expect(answer.past).toBe(416);
});

test('the API goes to the network, never the service worker', async ({ page }) => {
  await page.goto('/?c=want');
  await controlled(page);
  // Once the worker is in charge, the app's code comes from it and the
  // votes (stubbed by the fixtures, so offline can't show it) still don't.
  const [votes, code] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/votes'),
    page.waitForResponse((response) => /\/assets\/index-[^/]+\.js$/.test(response.url())),
    page.reload(),
  ]);
  expect(votes.fromServiceWorker()).toBe(false);
  expect(code.fromServiceWorker()).toBe(true);
});
