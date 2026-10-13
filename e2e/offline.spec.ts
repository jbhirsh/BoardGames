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

/** The rules page's status for a rulebook saved on this device (not the live region's "…device."). */
const savedStatus = (page: Page) => page.getByText('Saved on this device', { exact: true });

/** Whether the service worker has a rulebook saved. */
const inCache = (page: Page, pdf: string) => page.evaluate(async (path) => (await caches.match(path)) !== undefined, pdf);

/** Waits until a rulebook opened while online is saved for offline. */
async function saved(page: Page, pdf: string) {
  await expect.poll(() => inCache(page, pdf), { timeout: 15_000 }).toBe(true);
}

/**
 * Saves the rulebook on screen with its Save for offline button, as a
 * large one (3 MB or more) needs: opening it saves only a small one.
 */
async function saveForOffline(page: Page) {
  await page.getByRole('button', { name: 'Save for offline' }).click();
  await expect(savedStatus(page)).toBeVisible({ timeout: 15_000 });
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
 * Opens a rulebook while online after a first visit (at p. 1), saving it
 * with Save for offline if `tap` (a large one), then scrolls to page `n`
 * with no network, then online again: the page's drawing both ways. A page
 * whose images need a decoder the reader never fetched online would be
 * missing them offline.
 */
async function offlineAndOnline(page: Page, context: BrowserContext, slug: string, name: string, n: number, tap = false) {
  await page.goto('/');
  await controlled(page);
  await page.goto(`/rules/${slug}`);
  const reader = page.getByRole('region', { name: `${name} rules` });
  await expect(reader.getByRole('button', { name: 'Search' })).toBeEnabled();
  if (tap) await saveForOffline(page);
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
  const box = page.getByRole('button', { name: 'Show Catan in the list' });
  await expect.poll(() => box.evaluate((cover) => cover.querySelector('img')?.naturalWidth ?? 0)).toBeGreaterThan(0);

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

test('the wishlist\'s box art, seen once online, shows on its cards with no network', async ({ page, context }) => {
  await page.goto('/');
  await controlled(page);
  await page.goto('/?c=want&v=grid');
  // The bundled art the cards near the screen drew (the rest loads lazily,
  // and a friend's suggestion shows BoardGameGeek's, which the worker
  // leaves alone), once the worker has saved it, marked with the build's
  // hash of the file so an update that changes it drops the copy.
  const art = page.getByRole('img', { name: / box art$/ });
  const drawn = () => art.evaluateAll((imgs) => (imgs as HTMLImageElement[])
    .filter((img) => img.getAttribute('src')!.startsWith('/images/wishlist/') && img.complete && img.naturalWidth > 0)
    .map((img) => ({ name: img.alt, src: img.getAttribute('src')! })));
  await expect.poll(async () => (await drawn()).length).toBeGreaterThanOrEqual(3);
  const seen = await drawn();
  await expect.poll(() => page.evaluate(async (paths) => {
    for (const path of paths) if (!(await caches.match(path))?.headers.get('X-Art-Version')) return false;
    return true;
  }, seen.map((img) => img.src)), { timeout: 15_000 }).toBe(true);

  await goOffline(context);
  await page.reload();
  for (const { name } of seen) {
    const img = page.getByRole('img', { name, exact: true });
    // The hero's covers load the same files, so a card far down the list
    // can draw online from the memory cache without coming near the
    // screen; offline it waits, lazily, until it does.
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { message: name }).toBeGreaterThan(0);
  }
});

test('a large rulebook saved with Save for offline draws offline, its JPEG 2000 pages included', async ({ page, context }) => {
  // Catan's p. 5 is drawn over a JPEG 2000 image; at 3.7 MB, opening it
  // doesn't save it.
  const { offline, online } = await offlineAndOnline(page, context, 'catan', 'Catan', 5, true);
  expect(offline).toBe(online);
});

test('a saved rulebook draws offline a page with images never opened online', async ({ page, context }) => {
  // Azul's only JPEG 2000 image is on p. 6, which opening the rulebook at
  // p. 1 never draws: its decoder comes with the saved rulebook.
  const { offline, online } = await offlineAndOnline(page, context, 'azul', 'Azul', 6);
  expect(offline).toBe(online);
});

test('a small rulebook saves itself on its first open, says so, and reads offline', async ({ page, context }) => {
  await page.goto('/');
  await controlled(page);
  // Azul's rulebook is 1.5 MB, under the 3 MB a first open saves.
  await page.goto('/rules/azul');
  const reader = page.getByRole('region', { name: 'Azul rules' });
  await expect(reader.getByRole('button', { name: 'Search' })).toBeEnabled();
  const savedHere = savedStatus(page);
  await expect(savedHere).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save for offline' })).toHaveCount(0);
  await readerSaved(page);

  await goOffline(context);
  await page.reload();
  await expect(reader.getByRole('button', { name: 'Search' })).toBeEnabled();
  await expect(savedHere).toBeVisible();
  await expect(page.getByText(/Not saved on this device/)).toHaveCount(0);
});

test('a large rulebook isn\'t saved by opening it, and offline says to tap Save for offline next time', async ({ page, context }) => {
  await page.goto('/');
  await controlled(page);
  // Ticket to Ride's rulebook is 3.6 MB.
  await page.goto('/rules/ticket-to-ride');
  await expect(page.getByRole('region', { name: 'Ticket to Ride rules' }).getByRole('button', { name: 'Search' })).toBeEnabled();
  // Described by the Download link's size, the third item in its row.
  const save = page.getByRole('button', { name: 'Save for offline' });
  await expect(save).toHaveAccessibleDescription('3.6 MB');
  expect(await inCache(page, '/rules/ticket-to-ride.pdf')).toBe(false);
  const download = page.getByRole('link', { name: 'Download PDF' });
  const open = page.getByRole('link', { name: 'Open PDF' });
  // Level with them on a desktop, and on a phone too, where the three keep
  // one line in fewer words: Download and Open, "PDF" still read out, and
  // Save offline, named so (a name holds the words it shows).
  for (const width of [1280, 414, 375, 320]) {
    await page.setViewportSize({ width, height: 812 });
    const item = width > 600 ? save : page.getByRole('button', { name: 'Save offline' });
    await expect(item).toBeVisible();
    const [d, o, s] = await Promise.all([download.boundingBox(), open.boundingBox(), item.boundingBox()]);
    expect([o!.y, s!.y], `at ${width}px`).toEqual([d!.y, d!.y]);
    expect([o!.height, s!.height], `at ${width}px`).toEqual([d!.height, d!.height]);
    expect(o!.x, `at ${width}px`).toBeGreaterThan(d!.x + d!.width);
    expect(s!.x, `at ${width}px`).toBeGreaterThan(o!.x + o!.width);
    expect(s!.x + s!.width, `at ${width}px`).toBeLessThanOrEqual(width - 16);
  }

  await goOffline(context);
  await page.reload();
  // The notice names the button as it reads: "Save offline" on a phone.
  const notice = page.getByText(/^Not saved on this device yet\. Tap Save/);
  await expect(notice).toBeVisible();
  expect(await notice.evaluate((el) => (el as HTMLElement).innerText)).toBe('Not saved on this device yet. Tap Save offline next time you have signal.');
  await page.setViewportSize({ width: 1280, height: 812 });
  expect(await notice.evaluate((el) => (el as HTMLElement).innerText)).toBe('Not saved on this device yet. Tap Save for offline next time you have signal.');
  await expect(page.getByRole('button', { name: /^Save/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download PDF' })).toHaveCount(0);
});

test('a large rulebook saved with Save for offline reads offline, and says it is saved', async ({ page, context }) => {
  await page.goto('/');
  await controlled(page);
  await page.goto('/rules/ticket-to-ride');
  const reader = page.getByRole('region', { name: 'Ticket to Ride rules' });
  await expect(reader.getByRole('button', { name: 'Search' })).toBeEnabled();
  await saveForOffline(page);
  await readerSaved(page);

  await goOffline(context);
  await page.reload();
  await expect(savedStatus(page)).toBeVisible();
  await reader.getByRole('searchbox', { name: 'Search the rulebook' }).fill('destination tickets');
  await reader.getByRole('button', { name: 'Search' }).click();
  await expect(reader.getByRole('status')).toHaveText(/^1 of \d+ · page \d+$/);
});

test('a rulebook the device has no room for says so, with nothing to try again', async ({ page, context, baseURL }) => {
  await page.goto('/');
  await controlled(page);
  // Room for a little more than the site holds already: not for 3.6 MB.
  const cdp = await context.newCDPSession(page);
  const origin = new URL(baseURL!).origin;
  const { usage } = await page.evaluate(() => navigator.storage.estimate());
  await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: usage! + 1_000_000 });
  try {
    await page.goto('/rules/ticket-to-ride');
    await expect(page.getByRole('region', { name: 'Ticket to Ride rules' }).getByRole('button', { name: 'Search' })).toBeEnabled();
    await page.getByRole('button', { name: 'Save for offline' }).click();
    await expect(page.getByText('Not enough space on this device', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Try again/ })).toHaveCount(0);
    expect(await inCache(page, '/rules/ticket-to-ride.pdf')).toBe(false);
  } finally {
    await cdp.send('Storage.overrideQuotaForOrigin', { origin });
  }
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

test('offline on a rules page, the chat says the assistant needs a connection and waits for one', async ({ page, context }) => {
  await page.goto('/');
  await controlled(page);
  await page.goto('/rules/catan');
  // The rulebook drawn and saved first, so it still works offline, as the
  // chat says (one not saved couldn't draw the pages it hasn't fetched).
  await expect(page.getByRole('region', { name: 'Catan rules' }).getByRole('button', { name: 'Search' })).toBeEnabled();
  await saveForOffline(page);
  await saved(page, '/rules/catan.pdf');
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  const send = page.getByRole('button', { name: 'Send' });
  const starter = page.getByRole('group', { name: 'Try asking' }).getByRole('button').first();
  await expect(starter).toBeEnabled();

  await goOffline(context);
  const reason = "You're offline — the assistant needs a connection. The rulebook below still works.";
  await expect(page.getByText(reason)).toBeVisible();
  await page.getByPlaceholder('Ask a rules question...').fill('Can I build on the coast?');
  await expect(send).toBeDisabled();
  await expect(send).toHaveAccessibleDescription(reason);
  await expect(starter).toBeDisabled();

  await goOnline(context);
  await expect(page.getByText(reason)).toHaveCount(0);
  await expect(send).toBeEnabled();
  await expect(starter).toBeEnabled();
});

test('a rulebook never opened says offline that it isn\'t saved, with no dead links to it', async ({ page, context }) => {
  await page.goto('/');
  await controlled(page);
  await goOffline(context);

  await page.goto('/rules/azul');
  await expect(page.getByRole('heading', { level: 1, name: 'Azul' })).toBeVisible();
  await expect(page.getByText('Not saved on this device yet. Open it once with signal.')).toBeVisible();
  await expect(page.getByText(/couldn’t be shown here/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download PDF' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open PDF' })).toHaveCount(0);
  // Nothing to search either.
  await expect(page.getByRole('search')).toHaveCount(0);
});

test('a rulebook that failed offline loads by itself when the network comes back', async ({ page, context }) => {
  await page.goto('/');
  await controlled(page);
  await goOffline(context);
  await page.goto('/rules/azul');
  const notSaved = page.getByText('Not saved on this device yet. Open it once with signal.');
  await expect(notSaved).toBeVisible();

  await goOnline(context);
  await expect(page.getByRole('region', { name: 'Azul rules' }).getByRole('button', { name: 'Search' })).toBeEnabled();
  await expect(notSaved).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download PDF' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open PDF' })).toBeVisible();
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
