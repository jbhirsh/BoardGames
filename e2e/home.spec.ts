import { GAMES } from '../src/data/games';
import { WISHLIST } from '../src/data/wishlist';
import { test, expect, SUGGESTION } from './fixtures';

/** Every game row in the visible list carries a "Show details for <name>" toggle. */
const rowToggles = /^Show details for /;

test('the home page lists the whole collection', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Our Game Room' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Our Collection' })).toBeVisible();
  await expect(page.getByText(`${GAMES.length} games`, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: rowToggles })).toHaveCount(GAMES.length);
  for (const name of ['Azul', 'Bananagrams', '7 Wonders']) {
    await expect(page.getByRole('button', { name: `Show details for ${name}` })).toBeVisible();
  }
});

test('players and time filters narrow the list and survive a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: rowToggles })).toHaveCount(GAMES.length);

  await page.getByRole('button', { name: 'Duration', exact: true }).click();
  await page.getByRole('button', { name: 'Quick ≤ 15 min' }).click();
  await page.getByRole('button', { name: 'Players', exact: true }).click();
  await page.getByRole('button', { name: '2 players', exact: true }).click();

  await expect(page).toHaveURL(/\/\?d=quick&p=2$/);
  const assertFiltered = async () => {
    await expect(page.getByRole('button', { name: '≤ 15 min', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '2 players', exact: true })).toBeVisible();
    // Bananagrams is 2–8 players in 15 minutes; Cranium needs four and an hour.
    await expect(page.getByRole('button', { name: 'Show details for Bananagrams' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show details for Cranium' })).toHaveCount(0);
  };
  await assertFiltered();
  const narrowed = await page.getByRole('button', { name: rowToggles }).count();
  expect(narrowed).toBeLessThan(GAMES.length);
  await expect(page.getByText(`${narrowed} games`, { exact: true })).toBeVisible();

  await page.reload();
  await assertFiltered();
  await expect(page.getByRole('button', { name: rowToggles })).toHaveCount(narrowed);
  await expect(page).toHaveURL(/\/\?d=quick&p=2$/);
});

test('the Own/Want toggle switches to the wishlist', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'We want' }).click();

  await expect(page).toHaveURL(/\/\?c=want$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Wishlist' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Our Collection' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'We want' })).toHaveAttribute('aria-pressed', 'true');
  // The compiled-in list plus the approved suggestion from the stub.
  const total = WISHLIST.length + 1;
  await expect(page.getByText(`${total} games`, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Vote for / })).toHaveCount(total);
  await expect(page.getByRole('button', { name: `Show details for ${SUGGESTION.game}` })).toBeVisible();

  await page.getByRole('button', { name: 'We own' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Our Collection' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Wishlist' })).toBeHidden();
});

test('the random picker picks a game from the filtered list', async ({ page }) => {
  await page.goto('/');
  // Narrowed to one game, so the pick is known in advance.
  await page.getByPlaceholder('Search games...').fill('Azul');
  await expect(page.getByRole('button', { name: rowToggles })).toHaveCount(1);

  await page.getByRole('button', { name: 'Pick for us' }).click();

  const dialog = page.getByRole('dialog');
  // Named "Spinning…" until the spin settles on the pick.
  await expect(dialog).toHaveAccessibleName('Tonight, play — Azul');
  await expect(dialog.getByRole('button', { name: 'Pick again' })).toBeVisible();

  await dialog.getByRole('button', { name: 'View rules' }).click();
  await expect(page).toHaveURL(/\/rules\/azul$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Azul' })).toBeVisible();
});

test("opening a card's games on the grid gives it a row of its own and keeps the order", async ({ page }) => {
  await page.goto('/?v=grid');
  // At desktop width Bananagrams, Card Deck and Cards Against Humanity share
  // a row. Opening Card Deck's games moves it to a full-width row of its own
  // (its row-mates aren't stretched to the list's height), and the cards
  // after it stay after it, as they read and tab, rather than packing up
  // into the gap it left.
  const heading = (name: string) => page.getByRole('heading', { level: 3, name });
  await page.getByRole('button', { name: /^Card Deck: / }).click();
  await expect(page.getByText(/^Partnership trick-taking/)).toBeVisible();
  // Read together, after the click's scroll, so the offsets compare.
  const beside = (await heading('Bananagrams').boundingBox())!;
  const deck = (await heading('Card Deck').boundingBox())!;
  const next = (await heading('Cards Against Humanity').boundingBox())!;
  expect(deck.y).toBeGreaterThan(beside.y);
  expect(next.y).toBeGreaterThan(deck.y);
});

test('on a phone, the collection is cards only and More opens a game\'s write-up', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=list');

  await expect(page.getByRole('heading', { level: 3, name: 'Azul' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'List view' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: rowToggles })).toHaveCount(0);

  const more = page.getByRole('button', { name: 'More about Azul' });
  await more.click();
  await expect(page.getByRole('button', { name: 'Less about Azul' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('heading', { name: 'Awards' })).toBeVisible();
});

test('on a desktop grid, More opens a game\'s write-up across the row', async ({ page }) => {
  await page.goto('/?v=grid');
  await page.getByRole('button', { name: 'More about Azul' }).click();
  await expect(page.getByRole('button', { name: 'Less about Azul' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('heading', { name: 'Awards' })).toBeVisible();
  await page.getByRole('button', { name: 'Less about Azul' }).click();
  await expect(page.getByRole('heading', { name: 'Awards' })).toHaveCount(0);
});

test('pages carry their own titles and the site has a link preview', async ({ page, request }) => {
  // Link previews read the served HTML, not the rendered page.
  const html = await (await request.get('/')).text();
  expect(html).toContain('<meta property="og:image" content="https://board-games-silk.vercel.app/og-image.png" />');
  expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  const og = await request.get('/og-image.png');
  expect(og.status()).toBe(200);
  expect(og.headers()['content-type']).toBe('image/png');

  await page.goto('/');
  await expect(page).toHaveTitle('The Game Room');
  await page.goto('/rules/catan');
  await expect(page).toHaveTitle('Catan rules · The Game Room');
});

test('an empty result names the filters and offers to drop one', async ({ page }) => {
  // Nothing long seats ten and is a word game.
  await page.goto('/?d=long&p=10&k=word');
  await expect(page.getByText('No games match your filters.')).toBeVisible();
  // The hidden wishlist section has its own empty state; act on the one showing.
  await expect(page.getByText('Filtering for 60+ min, 10 players and Word.').filter({ visible: true })).toBeVisible();

  await page.getByRole('button', { name: /^Drop Word, \d+ games?$/ }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/\?d=long&p=10$/);
  await expect(page.getByRole('button', { name: rowToggles }).first()).toBeVisible();
  // The button that was clicked is gone; focus lands on the list's heading.
  await expect(page.getByRole('heading', { level: 2, name: 'Our Collection' })).toBeFocused();
});
