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

test("the owner changes a game's BoardGameGeek match: a sheet of every game with the name, then Save", async ({
  page,
}) => {
  const edition = (bggId: number, year: number) => ({
    bggId,
    name: SETI,
    year,
    min: 1,
    max: 4,
    mins: 120,
    desc: `The ${year} edition.`,
    kw: [],
    img: null,
    weight: null,
    section: 'heavy',
    summary: `SETI, ${year}.`,
    honours: [],
  });
  await stubOperation(page, 'PreviewGame', () => ({
    previewGame: { outcome: 'AMBIGUOUS', details: null, matches: [edition(1, 2023), edition(2, 2026)] },
  }));
  await page.goto('/?c=want&v=grid&q=seti');
  const card = page.getByTestId('wishlist-item').filter({ has: page.getByRole('heading', { name: SETI }) });
  await card.getByRole('button', { name: `Edit ${SETI}` }).click();
  await card.getByRole('button', { name: 'Change match' }).click();
  const sheet = page.getByRole('dialog', { name: `Which ${SETI}?` });
  await expect(sheet.getByRole('button', { name: /^Use / })).toHaveCount(2);
  await sheet.getByRole('button', { name: `Use ${SETI} (2026), BGG 2` }).click();
  await expect(sheet).toBeHidden();
  const form = card.getByRole('form', { name: `Edit ${SETI}` });
  await expect(form.getByLabel('Description')).toHaveValue('The 2026 edition.');
  const edited = nextOperation(page, 'EditGame');
  await form.getByRole('button', { name: 'Save' }).click();
  expect(await edited).toMatchObject({ id: 'seti', details: { bgg: '2', mins: 120 } });
});

test('a visitor sees no pencil or bin', async ({ page }) => {
  await stubOperation(page, 'Session', () => ({ session: { admin: false } }));
  await page.goto('/?c=want&v=grid&q=seti');
  await expect(page.getByRole('heading', { name: SETI })).toBeVisible();
  await expect(page.getByRole('button', { name: `Edit ${SETI}` })).toHaveCount(0);
});

test("the owner's card footers stay one row at the desktop's widths, two-digit votes and all", async ({ page }) => {
  // Every entry has 23 votes, so Vote's label is as wide as a count usually gets.
  await stubOperation(page, 'WishlistVotes', ({ ids }) => ({
    wishlistVotes: { counts: (Array.isArray(ids) ? ids : []).map((id: unknown) => ({ id, count: 23 })), myVotes: [] },
  }));
  /** The vertical centre of what `locator` finds. */
  const middle = async (locator: ReturnType<typeof page.getByRole>) => {
    const box = (await locator.boundingBox())!;
    return box.y + box.height / 2;
  };
  // 1440: four 304px cards; 1304: four 290px cards, the narrowest the grid makes.
  for (const width of [1440, 1304]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?c=want&v=grid&q=seti');
    const edit = page.getByRole('button', { name: `Edit ${SETI}` });
    const video = page.getByRole('link', { name: `Watch ${SETI} tutorial on YouTube` });
    await expect(page.getByRole('button', { name: `Vote for ${SETI} (23 votes)` })).toBeVisible();
    expect(Math.abs((await middle(edit)) - (await middle(video)))).toBeLessThan(2);
  }
});
