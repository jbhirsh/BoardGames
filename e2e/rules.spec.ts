import { GAMES } from '../src/data/games';
import { test, expect, nextPost, CHAT_ANSWER } from './fixtures';

const GAME = 'Far-Out Questions';
const SLUG = 'far-out-questions';

test('a rules page shows the rulebook and the assistant answers a question', async ({ page, request }) => {
  await page.goto('/');
  await page.getByPlaceholder('Search games...').fill(GAME);
  await page.getByRole('button', { name: `Show details for ${GAME}` }).click();
  await page.getByRole('link', { name: 'Rules', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/rules/${SLUG}$`));
  await expect(page.getByRole('heading', { level: 1, name: GAME })).toBeVisible();

  const viewer = page.getByTitle(`${GAME} rules`);
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute('src', `/rules/${SLUG}.pdf`);
  // The file the viewer frames is really served by the build.
  const pdf = await request.get(`/rules/${SLUG}.pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  await expect(page.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('href', `/rules/${SLUG}.pdf`);

  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  await expect(page.getByText(`Hi! Ask me anything about the rules for ${GAME}.`)).toBeVisible();

  const question = 'Does everyone answer each question?';
  await page.getByPlaceholder('Ask a rules question...').fill(question);
  const sent = nextPost(page, '/api/chat');
  await page.getByRole('button', { name: 'Send' }).click();

  expect((await sent).postDataJSON()).toEqual({ slug: SLUG, message: question, history: [] });
  await expect(page.getByText(question)).toBeVisible();
  // The reply's Markdown is rendered, not shown raw.
  await expect(page.getByText('Yes. Every player answers each question, then you vote.')).toBeVisible();
  await expect(page.getByText('Every player', { exact: true })).toHaveRole('strong');
  await expect(page.getByText(CHAT_ANSWER)).toHaveCount(0);
  await expect(page.getByPlaceholder('Ask a rules question...')).toHaveValue('');
});

test('a game\'s house rules open above its rulebook, on every tab', async ({ page }) => {
  const rules = GAMES.find(g => g.slug === 'hogwarts-battle')!.houseRules!;
  await page.goto('/rules/hogwarts-battle');

  const first = page.getByText(rules[0].text);
  await expect(first).toBeHidden();
  await page.getByText('House rules').click();
  for (const r of rules) {
    await expect(page.getByText(r.name, { exact: true })).toBeVisible();
    await expect(page.getByText(r.text)).toBeVisible();
  }

  await page.getByRole('link', { name: /Monster Box 1/ }).click();
  await expect(page).toHaveURL(/\/rules\/hogwarts-battle\/monster-box-of-monsters$/);
  await expect(page.getByText('House rules')).toBeVisible();
});

test('a rate-limited question comes back to the box and Retry asks it again', async ({ page }) => {
  // The first ask is rate limited; the retry falls through to the fixture's answer.
  let asked = 0;
  await page.route('**/api/chat', (route) =>
    asked++ === 0
      ? route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"Too many requests."}' })
      : route.fallback(),
  );
  await page.goto(`/rules/${SLUG}`);
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();

  const box = page.getByPlaceholder('Ask a rules question...');
  const question = 'Does everyone answer each question?';
  await box.fill(question);
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByRole('alert')).toHaveText(/Too many questions just now/);
  await expect(box).toHaveValue(question);

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Yes. Every player answers each question, then you vote.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText(question)).toHaveCount(1);
});

test('the daily cap says the assistant is done for today, not to wait a minute', async ({ page }) => {
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: '{"error":"The rules assistant has reached its limit for today.","code":"daily-limit"}',
    }),
  );
  await page.goto(`/rules/${SLUG}`);
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  await page.getByPlaceholder('Ask a rules question...').fill('Does everyone answer each question?');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByRole('alert')).toHaveText(/reached its limit for today\. The rulebook still works\./);
});

test('under a players filter, Rules opens the add-on the game fits through', async ({ page }) => {
  // Catan seats 3–4; at five it is listed for its 5–6 Player Extension.
  await page.goto('/?q=catan&p=5&v=grid');
  await page.getByRole('link', { name: 'Rules', exact: true }).click();
  await expect(page).toHaveURL(/\/rules\/catan\/5-6-player-extension$/);
});

test('an answer that names another rulebook links to its tab', async ({ page }) => {
  await page.route('**/api/chat', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: "That's in the 5 6 Player Extension." }),
  );
  await page.goto('/rules/catan');
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  await page.getByPlaceholder('Ask a rules question...').fill('How do we play with five?');
  await page.getByRole('button', { name: 'Send' }).click();

  await page.getByRole('link', { name: 'Open 5–6 Player Extension' }).click();
  await expect(page).toHaveURL(/\/rules\/catan\/5-6-player-extension$/);
});

test('a starter question asks itself, and a game with a calculator links to it', async ({ page }) => {
  await page.goto('/rules/7-wonders');
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  const starters = page.getByRole('group', { name: 'Try asking' });
  const sent = nextPost(page, '/api/chat');
  await starters.getByRole('button', { name: 'How does a turn go?' }).click();

  expect((await sent).postDataJSON()).toEqual({ slug: '7-wonders', message: 'How does a turn go?', history: [] });
  await expect(page.getByText('Yes. Every player answers each question, then you vote.')).toBeVisible();
  await expect(starters).toHaveCount(0);

  await page.getByRole('link', { name: 'Score calculator' }).click();
  await expect(page).toHaveURL(/\/score\/7-wonders$/);
});

test('on a phone the page draws the rulebook, searchable, under a download link', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Azul's pages carry JPEG 2000 images, which pdf.js decodes with the
  // WebAssembly the build copies to /pdfjs/.
  await page.goto('/rules/azul');

  const download = page.getByRole('link', { name: 'Download PDF' });
  await expect(download).toHaveAttribute('href', '/rules/azul.pdf');
  await expect(download).toHaveAccessibleDescription(/^\d+(\.\d)? (MB|KB)$/);
  await expect(page.getByTitle('Azul rules')).toHaveCount(0);

  const reader = page.getByRole('region', { name: 'Azul rules' });
  await expect(reader.getByText('Factory').first()).toBeAttached();
  await reader.getByRole('searchbox', { name: 'Search the rulebook' }).fill('factory display');
  await reader.getByRole('button', { name: 'Search' }).click();
  await expect(reader.getByRole('status')).toHaveText(/^1 of \d+ · page \d+$/);
  await reader.getByRole('button', { name: 'Next match' }).click();
  await expect(reader.getByRole('status')).toHaveText(/^2 of \d+ · page \d+$/);
});

test('a scanned rulebook can be searched on a phone too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // One Night's rulebook is a scan; its words are an OCR text layer.
  await page.goto('/rules/one-night-werewolf');
  const reader = page.getByRole('region', { name: 'One Night Werewolf rules' });
  await reader.getByRole('searchbox', { name: 'Search the rulebook' }).fill('seer');
  await reader.getByRole('button', { name: 'Search' }).click();
  await expect(reader.getByRole('status')).toHaveText(/^1 of \d+ · page 1$/);
});

test('on a phone a rulebook tab opens its own book in the reader', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/rules/catan');
  await expect(page.getByRole('region', { name: 'Catan rules' }).getByRole('button', { name: 'Search' })).toBeEnabled();

  // The reader for the next tab opens on the worker the last one used, and
  // reads its own book: the barbarians are only in Cities & Knights.
  await page.getByRole('navigation', { name: 'Rulebooks' }).getByRole('link', { name: /Cities & Knights/ }).click();
  const next = page.getByRole('region', { name: /Cities & Knights rules/ });
  await next.getByRole('searchbox', { name: 'Search the rulebook' }).fill('barbarian');
  await next.getByRole('button', { name: 'Search' }).click();
  // A search reads every page, each its own byte-range download.
  await expect(next.getByRole('status')).toHaveText(/^1 of \d+ · page \d+$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Catan' })).toBeVisible();
});

test('a long rulebook strip opens with the chosen tab in view', async ({ page }) => {
  // Hogwarts Battle has eleven rulebook tabs, more than a desktop strip shows.
  await page.goto('/rules/hogwarts-battle/monster-box-4');
  const strip = page.getByRole('navigation', { name: 'Rulebooks' });
  const chosen = strip.getByRole('link', { name: /^Monster Box 4/ });
  await expect(chosen).toHaveAttribute('aria-current', 'page');
  await expect(chosen).toBeInViewport({ ratio: 1 });
  await expect(strip.getByRole('link', { name: 'Game 1', exact: true })).not.toBeInViewport();
});

test('a tab opened from a link sits clear of the strip\'s faded edge', async ({ page }) => {
  await page.goto('/rules/hogwarts-battle/game-6');
  const strip = page.getByRole('navigation', { name: 'Rulebooks' });
  const chosen = strip.getByRole('link', { name: 'Game 6', exact: true });
  await expect(chosen).toHaveAttribute('aria-current', 'page');
  // The edge fades over 48px; snapping must not pull the tab back into it.
  await expect.poll(async () => (await chosen.boundingBox())!.x - (await strip.boundingBox())!.x).toBeGreaterThanOrEqual(40);
});

test('an answer\'s page citations open their rulebook at that page', async ({ page, request }) => {
  await page.route('**/api/chat', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: 'Three stations at most (Europe p. 4), built instead of claiming a route (Ticket To Ride p. 3), as before (p. 5).' }),
  );
  await page.goto('/rules/ticket-to-ride/europe');
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  await page.getByPlaceholder('Ask a rules question...').fill('How many stations can I build?');
  await page.getByRole('button', { name: 'Send' }).click();

  // Each named page opens its own rulebook there, shown by its tab label.
  const europe = page.getByRole('link', { name: 'Europe p. 4', exact: true });
  await expect(europe).toHaveAttribute('href', '/rules/ticket-to-ride.europe.pdf#page=4');
  await expect(europe).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('link', { name: 'Base game p. 3', exact: true })).toHaveAttribute('href', '/rules/ticket-to-ride.pdf#page=3');
  // With two rulebooks read, a bare page could be either: it stays text.
  await expect(page.getByText('as before (p. 5).', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: /p\. 5/ })).toHaveCount(0);
  expect((await request.get('/rules/ticket-to-ride.europe.pdf')).status()).toBe(200);
});
