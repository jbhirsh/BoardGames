import { GAMES } from '../src/data/games';
import type { Locator } from '@playwright/test';
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

  // A desktop gets the page's own reader too, not the browser's PDF viewer.
  const reader = page.getByRole('region', { name: `${GAME} rules` });
  await expect(reader.getByRole('group', { name: /^Page 1 of \d+$/ })).toBeVisible();
  await expect(reader.getByRole('button', { name: 'Search' })).toBeEnabled();
  // The file the reader draws is really served by the build.
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

/** How far, in whole pixels, a page's top is from where a jump puts it: under the reader's search bar. */
const offTarget = (box: Locator) =>
  box.evaluate((el) => Math.round(Math.abs(el.getBoundingClientRect().top - parseFloat(getComputedStyle(el).scrollMarginTop))));

test('on a phone a citation of another tab\'s rulebook opens that tab at the page, under the answer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const answer = 'Knights hold off the barbarians (Cities And Knights p. 4), and a 7 still moves the robber (Catan p. 5).';
  await page.route('**/api/chat', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: answer }),
  );
  await page.goto('/rules/catan/cities-and-knights');
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  await page.getByPlaceholder('Ask a rules question...').fill('What happens on a 7?');
  await page.getByRole('button', { name: 'Send' }).click();

  // On Cities & Knights the assistant reads Catan too, so it cites it.
  await page.getByRole('link', { name: 'Base game p. 5', exact: true }).click();

  await expect(page).toHaveURL(/\/rules\/catan\?page=5$/);
  const strip = page.getByRole('navigation', { name: 'Rulebooks' });
  await expect(strip.getByRole('link', { name: 'Base game' })).toHaveAttribute('aria-current', 'page');
  // The reader scrolls the cited page to the top, under its search bar, and
  // puts focus on it, so a screen reader says where it went.
  const cited = page.getByRole('region', { name: 'Catan rules' }).getByRole('group', { name: /^Page 5 of \d+$/ });
  await expect(cited).toBeFocused();
  await expect(cited).toBeInViewport();
  await expect.poll(() => offTarget(cited)).toBe(0);
  // The conversation stays, its links as they were on the tab it was asked
  // on, and the chat now says what it reads for this tab.
  await expect(page.getByText('a 7 still moves the robber', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cities & Knights p. 4', exact: true })).toHaveAttribute('href', '/rules/catan.cities-and-knights.pdf#page=4');
  await expect(page.getByText('Reading: Base game.')).toBeAttached();
});

test('on a phone a jump lands on its page in a rulebook of mixed page sizes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Cranium's pages run tall, short and wide: sized like the first until
  // drawn, the pages above would move page 7 as the scroll passed them.
  await page.route('**/api/chat', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: 'Roll the die to move (p. 7).' }),
  );
  await page.goto('/rules/cranium');
  await expect(page.getByRole('region', { name: 'Cranium rules' }).getByRole('button', { name: 'Search' })).toBeEnabled();
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  await page.getByPlaceholder('Ask a rules question...').fill('How do we move?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('link', { name: 'p. 7, Cranium rulebook', exact: true }).click();

  await expect(page).toHaveURL(/\/rules\/cranium\?page=7$/);
  const cited = page.getByRole('group', { name: /^Page 7 of \d+$/ });
  await expect(cited).toBeFocused();
  await expect.poll(() => offTarget(cited)).toBe(0);
});

/** The text of the marks on a page: the passage a citation points to, and any search matches. */
const marked = (box: Locator) => box.evaluate((el) => [...el.querySelectorAll('mark')].map((m) => m.textContent).join(' '));

/** Whether a page's first mark is on screen, clear of the reader's search bar. */
const markOnScreen = (box: Locator) => box.evaluate((el) => {
  const mark = el.querySelector('mark');
  if (!mark) return false;
  const { top, bottom } = mark.getBoundingClientRect();
  return top >= parseFloat(getComputedStyle(el).scrollMarginTop) && bottom <= window.innerHeight;
});

const ROBBER_ANSWER = 'If you roll a 7, nobody gets resources and anyone holding more than 7 cards returns half of them (p. 5).';

test('on a desktop a citation opens its page in place and marks the passage it points to', async ({ page }) => {
  await page.route('**/api/chat', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: ROBBER_ANSWER }),
  );
  await page.goto('/rules/catan');
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  await page.getByPlaceholder('Ask a rules question...').fill('What happens on a 7?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('link', { name: 'p. 5, Base game', exact: true }).click();

  // In place, not a new tab: the reader scrolls to the page and focuses it.
  await expect(page).toHaveURL(/\/rules\/catan\?page=5$/);
  expect(page.context().pages()).toHaveLength(1);
  const reader = page.getByRole('region', { name: 'Catan rules' });
  const cited = reader.getByRole('group', { name: /^Page 5 of \d+$/ });
  await expect(cited).toBeFocused();
  // The answer's words are found on the page and marked, said for a screen
  // reader, and brought on screen though the page is taller than the window.
  await expect(reader.getByText(/^Base game, page 5\. Highlighted: If you roll a .7,. no…$/)).toBeAttached();
  // Whole sentences, from the one the answer's words start in.
  await expect.poll(() => marked(cited)).toMatch(/^If you roll a .7,. no one receives any resources\. Instead, every player who has more than 7 resource cards .* return them to the bank\.$/);
  await expect.poll(() => markOnScreen(cited)).toBe(true);

  // A search of the reader's own takes the mark's place.
  await reader.getByRole('searchbox', { name: 'Search the rulebook' }).fill('largest army');
  await reader.getByRole('button', { name: 'Search' }).click();
  await expect(reader.getByRole('status')).toHaveText(/^1 of \d+ · page \d+$/);
  await expect.poll(() => marked(cited)).not.toContain('resource cards');
});

test('on a phone a citation marks the passage it points to, on another tab\'s rulebook', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/chat', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: ROBBER_ANSWER.replace('(p. 5)', '(Catan p. 5)') }),
  );
  await page.goto('/rules/catan/cities-and-knights');
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  await page.getByPlaceholder('Ask a rules question...').fill('What happens on a 7?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('link', { name: 'Base game p. 5', exact: true }).click();

  await expect(page).toHaveURL(/\/rules\/catan\?page=5$/);
  const reader = page.getByRole('region', { name: 'Catan rules' });
  const cited = reader.getByRole('group', { name: /^Page 5 of \d+$/ });
  await expect(cited).toBeFocused();
  await expect.poll(() => marked(cited)).toContain('more than 7 resource cards');
  await expect.poll(() => markOnScreen(cited)).toBe(true);
  await expect(reader.getByText(/^Base game, page 5\. Highlighted: /)).toBeAttached();
});

test('the cited mark covers the words it marks on the page image', async ({ page }) => {
  await page.route('**/api/chat', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: ROBBER_ANSWER }),
  );
  await page.goto('/rules/catan');
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  await page.getByPlaceholder('Ask a rules question...').fill('What happens on a 7?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('link', { name: 'p. 5, Base game', exact: true }).click();
  const cited = page.getByRole('region', { name: 'Catan rules' }).getByRole('group', { name: /^Page 5 of \d+$/ });
  await expect.poll(() => marked(cited)).toContain('return them to the bank.');
  // Where the PDF draws the first and last words, from `pdftotext -bbox` on
  // public/rules/catan.pdf p. 5 (594pt wide): "If" from 44.44pt, "bank."
  // to 132.48pt. pdf.js lays its text out in a stand-in font, so a mark
  // starting mid-line could miss its word by pixels; a sentence's marks
  // start and end where the page's text items do.
  const edges = await cited.evaluate((el) => {
    const page = el.getBoundingClientRect();
    const k = page.width / 594;
    const marks = [...el.querySelectorAll('mark')];
    return {
      start: marks[0].getBoundingClientRect().left - (page.left + 44.44 * k),
      end: marks.at(-1)!.getBoundingClientRect().right - (page.left + 132.48 * k),
    };
  });
  expect(Math.abs(edges.start)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(edges.end)).toBeLessThanOrEqual(0.5);
});
