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

  await page.getByRole('button', { name: 'Results' }).click();
  await expect(page.getByText('👑')).toBeVisible();
  await expect(page.getByText('43 VP', { exact: true })).toBeVisible();
  await expect(page.getByText('0 VP', { exact: true })).toBeVisible();
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
