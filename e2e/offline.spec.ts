import type { BrowserContext, Locator, Page, Route } from '@playwright/test';
import { test, expect } from './fixtures';

// The service worker (src/sw/sw.ts) is blocked for every other spec.
test.use({ serviceWorkers: 'allow' });

/** Waits until the service worker has installed and controls the page. */
async function controlled(page: Page) {
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

/** Answers every request that reaches the network as a dropped connection would. */
const NO_NETWORK = (route: Route) => route.abort('internetdisconnected');

/**
 * Takes the network away. setOffline alone leaves the service worker's own
 * fetches online in Chromium, so a file it should have saved would still
 * come; a route cuts those (the page's own stubs answer first, as the API
 * would).
 */
async function goOffline(context: BrowserContext) {
  await context.setOffline(true);
  await context.route('**/*', NO_NETWORK);
}

async function goOnline(context: BrowserContext) {
  await context.unroute('**/*', NO_NETWORK);
  await context.setOffline(false);
}

/** Waits until a rulebook opened while online is saved for offline. */
async function saved(page: Page, pdf: string) {
  await expect.poll(() => page.evaluate(async (path) => (await caches.match(path)) !== undefined, pdf), { timeout: 15_000 }).toBe(true);
}

/**
 * Waits until the rulebook reader's own files are saved, which the service
 * worker does once a rulebook is: the JPEG 2000 decoder stands for them.
 */
async function readerSaved(page: Page) {
  await expect.poll(() => page.evaluate(async () => (await caches.match('/pdfjs/wasm/openjpeg.wasm')) !== undefined), { timeout: 15_000 }).toBe(true);
}

/** A hash of a rulebook page's drawing, once it is drawn (its text is laid over it after). */
async function drawing(group: Locator): Promise<string> {
  await group.scrollIntoViewIfNeeded();
  await expect.poll(() => group.evaluate((el) => el.querySelector('.textLayer')?.childElementCount ?? 0), { timeout: 15_000 }).toBeGreaterThan(0);
  return group.evaluate(async (el) => {
    const canvas = el.querySelector('canvas')!;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', pixels));
    return `${canvas.width}x${canvas.height} ${[...hash].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  });
}

/**
 * Opens a rulebook while online after a first visit (at p. 1), then scrolls
 * to page `n` with no network, then online again: the page's drawing both
 * ways. A page whose images need a decoder the reader never fetched online
 * would be missing them offline.
 */
async function offlineAndOnline(page: Page, context: BrowserContext, slug: string, name: string, n: number) {
  await page.goto('/');
  await controlled(page);
  await page.goto(`/rules/${slug}`);
  const reader = page.getByRole('region', { name: `${name} rules` });
  await expect(reader.getByRole('button', { name: 'Search' })).toBeEnabled();
  await saved(page, `/rules/${slug}.pdf`);
  await readerSaved(page);

  await goOffline(context);
  await page.reload();
  const shown = reader.getByRole('group', { name: new RegExp(`^Page ${n} of \\d+$`) });
  const offline = await drawing(shown);

  await goOnline(context);
  await page.reload();
  return { offline, online: await drawing(shown) };
}

test('after a first visit, the installed site lists the collection, checks words and keeps score with no network', async ({ page, context }) => {
  await page.goto('/');
  await controlled(page);
  // Box art opened in its own tab is a page too, and must not stand in for
  // the app.
  await page.goto('/images/catan.webp');
  await goOffline(context);

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

  // The score calculator, whose code (like every page's but the home
  // page's) loads when it is opened, saved at install all the same.
  await page.goto('/score/7-wonders');
  await expect(page.getByRole('heading', { level: 1, name: 'Score Calculator', exact: true })).toBeVisible();
  await page.getByRole('spinbutton', { name: /Military/ }).fill('5');
  await page.getByRole('spinbutton', { name: /Civilian/ }).fill('10');
  await expect(page.getByText('15 VP', { exact: true })).toBeVisible();
});

test('a rulebook opened online draws offline, its JPEG 2000 pages included', async ({ page, context }) => {
  // Catan's p. 5 is drawn over a JPEG 2000 image.
  const { offline, online } = await offlineAndOnline(page, context, 'catan', 'Catan', 5);
  expect(offline).toBe(online);
});

test('a saved rulebook draws offline a page with images never opened online', async ({ page, context }) => {
  // Azul's only JPEG 2000 image is on p. 6, which opening the rulebook at
  // p. 1 never draws: its decoder comes with the saved rulebook.
  const { offline, online } = await offlineAndOnline(page, context, 'azul', 'Azul', 6);
  expect(offline).toBe(online);
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

  await goOffline(context);
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
