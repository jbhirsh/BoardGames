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
  await page.getByRole('radio', { name: 'Up to 15 min' }).click();
  await page.getByRole('button', { name: 'Players', exact: true }).click();
  await page.getByRole('radio', { name: '2 players' }).click();

  await expect(page).toHaveURL(/\/\?d=15&p=2$/);
  const assertFiltered = async () => {
    await expect(page.getByRole('button', { name: 'Up to 15 min', exact: true })).toBeVisible();
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
  await expect(page).toHaveURL(/\/\?d=15&p=2$/);
});

test('a time budget keeps the quick games, and an old bucket link opens one', async ({ page }) => {
  // "Medium" from before budgets opens as up to an hour.
  await page.goto('/?d=medium');
  await expect(page.getByRole('button', { name: 'Up to 60 min', exact: true })).toBeVisible();
  // Bananagrams takes 15 minutes, Cranium an hour; Cards Against Humanity
  // runs to 90.
  await expect(page.getByRole('button', { name: 'Show details for Bananagrams' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show details for Cranium' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show details for Cards Against Humanity' })).toHaveCount(0);
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

test('on a phone, filters live in a sheet behind one button and survive a reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const filters = page.getByRole('button', { name: /^Filters/ });
  await expect(filters).toHaveText('Filters');
  await expect(page.getByRole('button', { name: 'Duration', exact: true })).toHaveCount(0);

  await filters.click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await expect(sheet).toBeFocused();
  await sheet.getByRole('radio', { name: 'Up to 15 min' }).click();
  await sheet.getByRole('radio', { name: '2 players' }).click();
  // Picks apply as they are made; the sheet stays open and says how many fit.
  await expect(page).toHaveURL(/\/\?d=15&p=2$/);
  await expect(sheet.getByRole('button', { name: /^Show \d+ games?$/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(filters).toBeFocused();
  await expect(filters).toHaveText('Filters · 2');
  // Bananagrams is 2–8 players in 15 minutes; Cranium needs four and an hour.
  await expect(page.getByRole('heading', { level: 3, name: 'Bananagrams' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Cranium' })).toHaveCount(0);

  // The bar stays on screen down the list; the tags that repeat it don't.
  await page.getByRole('heading', { level: 3, name: 'Poetry for Neanderthals' }).scrollIntoViewIfNeeded();
  await expect(filters).toBeInViewport();
  await expect(page.getByRole('button', { name: '2 players ✕' })).not.toBeInViewport();

  // Narrowing from down the list brings the shorter list's top back up.
  await filters.click();
  await page.getByRole('dialog', { name: 'Filters' }).getByRole('button', { name: /^Party/ }).click();
  await page.getByRole('dialog', { name: 'Filters' }).getByRole('button', { name: /^Show / }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Our Collection' })).toBeInViewport();
  await page.getByRole('button', { name: 'Party ✕' }).click();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Filters 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Filters 2' }).click();
  await page.getByRole('dialog', { name: 'Filters' }).getByRole('button', { name: 'Clear all' }).click();
  await page.getByRole('dialog', { name: 'Filters' }).getByRole('button', { name: `Show ${GAMES.length} games` }).click();
  await expect(page).toHaveURL(/\/$/);
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
  // No word game is played alone.
  await page.goto('/?d=15&p=1&k=word');
  await expect(page.getByText('No games match your filters.')).toBeVisible();
  // The hidden wishlist section has its own empty state; act on the one showing.
  await expect(page.getByText('Filtering for up to 15 min, 1 player and Word.').filter({ visible: true })).toBeVisible();

  await page.getByRole('button', { name: /^Drop Word, \d+ games?$/ }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/\?d=15&p=1$/);
  await expect(page.getByRole('button', { name: rowToggles }).first()).toBeVisible();
  // The button that was clicked is gone; focus lands on the list's heading.
  await expect(page.getByRole('heading', { level: 2, name: 'Our Collection' })).toBeFocused();
});

test('the picker lands a deck on one of its games', async ({ page }) => {
  // Euchre is one of the Card Deck's games, so the deck is the only match.
  await page.goto('/?q=Euchre');
  await page.getByRole('button', { name: 'Pick for us' }).click();
  // The search named one of the deck's games, so that's the one it lands on.
  const dialog = page.getByRole('dialog', { name: 'Tonight, play — Euchre' });
  await expect(dialog.getByText('Played with the Card Deck')).toBeVisible();
});

test('a cover on the hero shelf opens that game\'s rulebook', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('list', { name: 'Rulebooks' }).getByRole('link', { name: 'Azul rules' }).click();
  await expect(page).toHaveURL(/\/rules\/azul$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Azul' })).toBeVisible();
});

/** "Medium · 2.3", as utils/difficulty labels a BoardGameGeek weight: the word for the number shown. */
function weightLabel(weight: number): string {
  const shown = Math.round(weight * 10) / 10;
  return `${weightWord(shown)} · ${shown.toFixed(1)}`;
}

function weightWord(weight: number): string {
  if (weight < 2) return 'Light';
  return weight < 3 ? 'Medium' : 'Heavy';
}

/** A deck's label: the span of its rated games' weights, "Light–Medium · 1.0–2.0". */
function deckSpan(slug: string): string {
  const weights = GAMES.find((g) => g.slug === slug)!.subgames!.flatMap((s) => (s.weight === undefined ? [] : [s.weight]));
  const [lo, hi] = [weightLabel(Math.min(...weights)).split(' · '), weightLabel(Math.max(...weights)).split(' · ')];
  const span = (a: string, b: string) => (a === b ? a : `${a}–${b}`);
  return `${span(lo[0], hi[0])} · ${span(lo[1], hi[1])}`;
}

/** A game whose card label no other card shares, so the page shows it once. */
function uniquelyLabelled() {
  const labels = GAMES.flatMap((g) => (g.weight === undefined ? [] : [weightLabel(g.weight)]));
  return GAMES.find((g) => g.weight !== undefined && labels.filter((l) => l === weightLabel(g.weight!)).length === 1)!;
}

/** Where the Difficulty sort puts a game: a deck by its lightest game going up, its heaviest going down. */
function sortWeight(g: (typeof GAMES)[number], dir: 1 | -1): number {
  const known = [g.weight, ...(g.subgames ?? []).map((s) => s.weight)].flatMap((w) => (w === undefined ? [] : [w]));
  if (known.length === 0) return Infinity;
  return dir === 1 ? Math.min(...known) : Math.max(...known);
}

test('each card shows BoardGameGeek\'s difficulty, and a deck the span of its games\'', async ({ page }) => {
  await page.goto('/?v=grid');
  const game = uniquelyLabelled();
  await expect(page.getByText(`Difficulty: ${weightLabel(game.weight!)}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Difficulty: ${deckSpan('card-deck')}`, { exact: true })).toBeVisible();
});

test('the list sorts by difficulty from its column header', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?v=list');
  await page.getByRole('columnheader', { name: /Difficulty/ }).click();
  const lightest = [...GAMES].sort((a, b) => sortWeight(a, 1) - sortWeight(b, 1) || a.name.localeCompare(b.name))[0];
  await expect(page.getByRole('row').nth(1)).toContainText(lightest.name);
});
