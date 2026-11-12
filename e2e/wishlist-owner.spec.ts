import { test, expect, nextOperation, stubOperation } from './fixtures';

// The owner's Edit and Remove, on a game once written into the site's code
// (SETI), which every wishlist game now has.

const SETI = 'SETI: Search for Extraterrestrial Intelligence';

test.beforeEach(async ({ page }) => {
  await stubOperation(page, 'Session', () => ({ session: { admin: true } }));
  await stubOperation(page, 'PendingSuggestions', () => ({ pendingSuggestions: [] }));
  await stubOperation(page, 'EditGame', () => ({ editGame: { id: 'seti' } }));
  await stubOperation(page, 'RemoveGame', () => ({ removeGame: true }));
});

test('the owner edits a written entry from its pencil, and removes it from its bin after confirming', async ({
  page,
}) => {
  await page.goto('/?c=want&v=grid&q=seti');
  const card = page.getByTestId('wishlist-item').filter({ has: page.getByRole('heading', { name: SETI }) });
  await card.getByRole('button', { name: `Edit ${SETI}` }).click();
  const form = card.getByRole('form', { name: `Edit ${SETI}` });
  await form.getByLabel('Name').fill('SETI');
  const edited = nextOperation(page, 'EditGame');
  await form.getByRole('button', { name: 'Save' }).click();
  expect(await edited).toMatchObject({ id: 'seti', game: 'SETI', details: { type: 'heavy' } });

  await card.getByRole('button', { name: `Remove ${SETI}` }).click();
  const confirm = card.getByRole('group', { name: `Remove ${SETI}?` });
  await expect(confirm).toBeVisible();
  const removed = nextOperation(page, 'RemoveGame');
  await confirm.getByRole('button', { name: 'Yes, remove' }).click();
  expect(await removed).toEqual({ id: 'seti' });
});

test('a visitor sees no pencil or bin', async ({ page }) => {
  await stubOperation(page, 'Session', () => ({ session: { admin: false } }));
  await page.goto('/?c=want&v=grid&q=seti');
  await expect(page.getByRole('heading', { name: SETI })).toBeVisible();
  await expect(page.getByRole('button', { name: `Edit ${SETI}` })).toHaveCount(0);
});
