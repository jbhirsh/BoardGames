import { test, expect } from './fixtures';

test('the 7 Wonders calculator totals a player and ranks the table', async ({ page }) => {
  await page.goto('/score/7-wonders');
  await expect(page.getByRole('heading', { level: 1, name: 'Score Calculator', exact: true })).toBeVisible();

  const field = (name: string | RegExp) => page.getByRole('spinbutton', { name });
  await field(/Military/).fill('5');
  await field(/Treasury/).fill('7'); // 7 coins: 2 VP
  await field(/Wonder Stages/).fill('3');
  await field(/Civilian/).fill('10');
  await field(/Commercial/).fill('4');
  await field(/Guilds/).fill('6');
  // Science: 2² + 1² + 1² + 7 for the one full set = 13 VP.
  await field('tablets').fill('2');
  await field('compasses').fill('1');
  await field('gears').fill('1');

  await expect(page.getByText('= 2 VP', { exact: true })).toBeVisible();
  await expect(page.getByText('= 13 VP', { exact: true })).toBeVisible();
  // 5 + 2 + 3 + 10 + 4 + 6 + 13
  await expect(page.getByText('43 VP', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Results', exact: true }).click();
  const sheet = page.getByRole('table', { name: 'Scores by category' });
  const row = (name: string) => sheet.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
  await expect(row('Science').getByRole('cell')).toHaveText(['13', '0']);
  await expect(row('Total').getByRole('cell')).toHaveText(['43', '0']);
  await expect(row('Place').getByRole('cell')).toHaveText(['1st', '2nd']);
});

test('on a phone the score sheet scrolls sideways with the categories pinned', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/score/7-wonders');
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Add player' }).click();
  await page.getByRole('button', { name: 'Results', exact: true }).click();

  const sheet = page.getByRole('table', { name: 'Scores by category' });
  const military = sheet.getByRole('rowheader', { name: 'Military' });
  const before = (await military.boundingBox())!;
  // Seven players don't fit across a phone: the sheet scrolls, not the page.
  const scrolled = await sheet.evaluate((table) => {
    const wrap = table.parentElement!;
    wrap.scrollLeft = wrap.scrollWidth;
    return wrap.scrollLeft;
  });
  expect(scrolled).toBeGreaterThan(0);
  await expect(sheet.getByRole('columnheader', { name: 'Player 7' })).toBeInViewport();
  const after = (await military.boundingBox())!;
  expect(after.x).toBe(before.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('Next passes the phone round the table and ends on the results', async ({ page }) => {
  await page.goto('/score/7-wonders');
  await page.getByRole('spinbutton', { name: /Civilian/ }).fill('6');
  await page.getByRole('button', { name: 'Next: Player 2' }).click();
  await expect(page.getByLabel('Player Name')).toBeFocused();
  await expect(page.getByLabel('Player Name')).toHaveValue('Player 2');
  await page.getByRole('spinbutton', { name: /Civilian/ }).fill('9');
  await page.getByRole('button', { name: 'See results' }).click();
  const total = page.getByRole('table', { name: 'Scores by category' }).getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Total', exact: true }) });
  await expect(total.getByRole('cell')).toHaveText(['6', '9']);
});

test('a game with no score calculator shows the not-found page', async ({ page }) => {
  await page.goto('/score/catan');
  await expect(page.getByRole('heading', { level: 1, name: 'No score calculator', exact: true })).toBeVisible();
  await expect(page.getByText("There's no score calculator for that game.")).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Score Calculator', exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'Browse the collection' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Our Collection' })).toBeVisible();
});

test('a negative military score can be typed and the game survives a reload', async ({ page }) => {
  await page.goto('/score/7-wonders');
  const field = (name: string | RegExp) => page.getByRole('spinbutton', { name });

  await field(/Military/).click();
  await page.keyboard.type('-2');
  await field(/Civilian/).click();
  await page.keyboard.type('7');
  await expect(field(/Military/)).toHaveValue('-2');
  await expect(field(/Civilian/)).toHaveValue('7');
  await expect(page.getByText('5 VP', { exact: true })).toBeVisible();

  await page.reload();
  await expect(field(/Military/)).toHaveValue('-2');
  await expect(page.getByText('5 VP', { exact: true })).toBeVisible();
});
