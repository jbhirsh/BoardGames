import { test, expect, nextPost, ANON_ID, SUGGESTION } from './fixtures';

test('voting on a wishlist game posts the vote and shows the new count', async ({ page }) => {
  const votesLoaded = page.waitForRequest((req) => req.method() === 'GET' && new URL(req.url()).pathname === '/api/votes');
  await page.goto('/?c=want');

  const query = new URL((await votesLoaded).url()).searchParams;
  expect(query.get('anonId')).toBe(ANON_ID);
  expect(query.get('ids')?.split(',')).toEqual(expect.arrayContaining(['splendor', SUGGESTION.id]));

  // Enabled once the counts have loaded.
  const vote = page.getByRole('button', { name: 'Vote for Splendor (3 votes)' });
  await expect(vote).toBeEnabled();

  const cast = nextPost(page, '/api/votes');
  await vote.click();
  expect((await cast).postDataJSON()).toEqual({ itemId: 'splendor', anonId: ANON_ID, vote: 1 });

  const unvote = page.getByRole('button', { name: 'Remove your vote for Splendor (4 votes)' });
  await expect(unvote).toHaveAttribute('aria-pressed', 'true');

  const withdrawn = nextPost(page, '/api/votes');
  await unvote.click();
  expect((await withdrawn).postDataJSON()).toEqual({ itemId: 'splendor', anonId: ANON_ID, vote: 0 });
  await expect(page.getByRole('button', { name: 'Vote for Splendor (3 votes)' })).toHaveAttribute('aria-pressed', 'false');
});

test('the wishlist sorts by most votes, marks expansions and jumps to the suggest form', async ({ page }) => {
  await page.goto('/?c=want');
  // The stubbed counts: Splendor 3, the friend's suggestion 1, the rest 0.
  await expect(page.getByRole('button', { name: 'Vote for Splendor (3 votes)' })).toBeEnabled();
  await page.getByRole('button', { name: 'A→Z', exact: true }).click();
  await page.getByRole('radio', { name: 'Most votes' }).click();
  await expect(page).toHaveURL(/[?&]s=votes/);
  const rows = page.getByRole('button', { name: /^Show details for / });
  await expect(rows.nth(0)).toHaveAccessibleName('Show details for Splendor');
  await expect(rows.nth(1)).toHaveAccessibleName(`Show details for ${SUGGESTION.game}`);

  // Back to the collection, which has no votes to sort by.
  await page.getByRole('button', { name: 'We own' }).click();
  await expect(page.getByRole('button', { name: 'A→Z', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'We want' }).click();

  // A list row carries its tags twice, one copy for narrow widths; CSS shows one.
  await expect(page.getByText('Expansion for Catan (owned)').filter({ visible: true })).toBeVisible();

  await page.getByRole('button', { name: 'Suggest a game' }).click();
  const field = page.getByRole('form', { name: 'Suggest a game' }).getByLabel('Game');
  await expect(field).toBeFocused();
  await expect(field).toBeInViewport();
});
