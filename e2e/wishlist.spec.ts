import { test, expect, nextOperation, ANON_ID, SUGGESTION } from './fixtures';

test('voting on a wishlist game posts the vote and shows the new count', async ({ page }) => {
  const votesLoaded = nextOperation(page, 'WishlistVotes');
  await page.goto('/?c=want');

  const asked = await votesLoaded;
  expect(asked.anonId).toBe(ANON_ID);
  expect(asked.ids).toEqual(expect.arrayContaining(['splendor', SUGGESTION.id]));

  // Enabled once the counts have loaded.
  const vote = page.getByRole('button', { name: 'Vote for Splendor (3 votes)' });
  await expect(vote).toBeEnabled();

  const cast = nextOperation(page, 'Vote');
  await vote.click();
  expect(await cast).toEqual({ itemId: 'splendor', anonId: ANON_ID, vote: 1 });

  const unvote = page.getByRole('button', { name: 'Voted for Splendor (4 votes)' });
  await expect(unvote).toHaveAttribute('aria-pressed', 'true');

  const withdrawn = nextOperation(page, 'Vote');
  await unvote.click();
  expect(await withdrawn).toEqual({ itemId: 'splendor', anonId: ANON_ID, vote: 0 });
  await expect(page.getByRole('button', { name: 'Vote for Splendor (3 votes)' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
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

test('a friend opening the wishlist link is asked to vote, and sees the vote land', async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL!).origin });
  await page.goto('/?c=want&v=grid');
  await expect(page.getByText('Help us pick our next game from the wishlist below.')).toBeVisible();
  await expect(page.getByText("Heart the games you'd play. The top pick is what we buy next.")).toBeVisible();

  // The button keeps its verb beside the count, and says Voted once cast.
  const vote = page.getByRole('button', { name: 'Vote for Splendor (3 votes)' });
  await expect(vote).toBeEnabled();
  await expect(vote).toHaveText('♡Vote · 3');
  const voteWidth = (await vote.boundingBox())!.width;
  const cast = nextOperation(page, 'Vote');
  await vote.click();
  await cast;
  const voted = page.getByRole('button', { name: 'Voted for Splendor (4 votes)' });
  await expect(voted).toHaveText('♥Voted · 4');
  await expect(voted).toHaveAttribute('aria-pressed', 'true');
  // A vote landing doesn't change the button's width.
  expect((await voted.boundingBox())!.width).toBe(voteWidth);

  // Share wishlist copies the plain wishlist link.
  const share = page.getByRole('button', { name: 'Share wishlist' });
  const shareWidth = (await share.boundingBox())!.width;
  await share.click();
  const copied = page.getByRole('button', { name: 'Copied!' });
  await expect(copied).toBeVisible();
  // Nor does "Copied!" change Share wishlist's.
  expect((await copied.boundingBox())!.width).toBe(shareWidth);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(baseURL!).origin}/?c=want`);
});
