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
