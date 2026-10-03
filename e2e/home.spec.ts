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
