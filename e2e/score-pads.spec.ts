import { test, expect } from './fixtures';

// The pads past 7 Wonders (score.spec.ts has those), on a phone, as they're
// played at the table.
test.use({ viewport: { width: 390, height: 844 } });

test('Ticket to Ride scores each player\'s routes and tickets on the map played', async ({ page }) => {
  await page.goto('/score/ticket-to-ride');
  await page.getByRole('button', { name: 'Europe' }).click();
  await page.getByRole('spinbutton', { name: '8-train routes' }).fill('1');
  await page.getByRole('spinbutton', { name: '4-train routes' }).fill('2');
  await page.getByRole('button', { name: '+ Add ticket' }).click();
  await page.getByRole('spinbutton', { name: 'Ticket 1 points' }).fill('20');
  await page.getByRole('spinbutton', { name: 'Stations kept' }).fill('3');
  // 21 + 14 + 20 + 12
  await expect(page.getByText('67 points', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next: Player 2' }).click();
  await page.getByRole('spinbutton', { name: '6-train routes' }).fill('2');
  await page.getByRole('checkbox', { name: /European Express/ }).check();
  await page.getByRole('button', { name: 'See results' }).click();
  const sheet = page.getByRole('table', { name: 'Scores by category' });
  const row = (name: string) => sheet.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
  await expect(row('Total').getByRole('cell')).toHaveText(['67', '40']);
  await expect(row('Place').getByRole('cell')).toHaveText(['1st', '2nd']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('Dominion counts only the Kingdom cards ticked', async ({ page }) => {
  await page.goto('/score/dominion');
  await expect(page.getByRole('spinbutton', { name: 'Gardens' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Gardens' }).check();
  await page.getByRole('spinbutton', { name: 'Provinces' }).fill('5');
  await page.getByRole('spinbutton', { name: 'Gardens' }).fill('2');
  await page.getByRole('spinbutton', { name: 'Cards in your deck' }).fill('35');
  await expect(page.getByText('36 VP', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Gardens' })).toBeChecked();
  await expect(page.getByText('36 VP', { exact: true })).toBeVisible();
});
