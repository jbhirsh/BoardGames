import { test, expect } from './fixtures';

// The pads past 7 Wonders (score.spec.ts has those), on a phone, as they're
// played at the table.
test.use({ viewport: { width: 390, height: 844 } });

test("a deck's Hearts is scored hand by hand from its rules page, to the end", async ({ page }) => {
  await page.goto('/rules/card-deck/hearts');
  await page.getByRole('link', { name: 'Score calculator' }).click();
  await expect(page).toHaveURL(/\/score\/card-deck\/hearts$/);
  await expect(page.getByText('Hearts', { exact: true })).toBeVisible();

  for (const [i, name] of ['Ana', 'Ben', 'Cy'].entries()) await page.getByLabel(`Player ${i + 1} name`).fill(name);
  const add = page.getByRole('button', { name: /^Add hand/ });
  await expect(add).toBeDisabled();
  await page.getByRole('spinbutton', { name: 'Ana' }).fill('13');
  await page.getByRole('spinbutton', { name: 'Ben' }).fill('9');
  await expect(page.getByText("22 of the hand's 26 points so far.")).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Cy' }).fill('3');
  await expect(page.getByRole('status').filter({ hasText: 'These add up to 25' })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Cy' }).fill('4');
  await expect(page.getByText(/These add up to|so far/)).toHaveCount(0);
  await add.click();

  await page.getByRole('group', { name: 'Did anyone shoot the moon?' }).getByRole('button', { name: 'Ben' }).click();
  await page.getByRole('button', { name: 'Add hand 2' }).click();
  const sheet = page.getByRole('table', { name: 'Scores by hand' });
  const total = sheet.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Total' }) });
  await expect(total.getByRole('cell')).toHaveText(['39', '9', '30']);

  // The game survives a reload, and a hand can be put right.
  await page.reload();
  await sheet.getByRole('button', { name: 'Fix hand 1' }).click();
  await expect(page.getByRole('heading', { name: 'Fix hand 1' })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Ana' }).fill('3');
  await page.getByRole('spinbutton', { name: 'Cy' }).fill('14');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(total.getByRole('cell')).toHaveText(['29', '9', '40']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("Uno's Score button opens its pad, and the first to 500 wins", async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Search games...').fill('Uno');
  // A phone lists a line a game; Score is in the line, opened.
  await page.getByRole('button', { name: 'Show details for Uno' }).click();
  await page.getByRole('link', { name: 'Score', exact: true }).click();
  await expect(page).toHaveURL(/\/score\/uno$/);
  const out = page.getByRole('group', { name: 'Who went out?' });
  for (let round = 1; round <= 3; round++) {
    await out.getByRole('button', { name: 'Player 1' }).click();
    await page.getByRole('spinbutton', { name: 'Player 2' }).fill('180');
    await page.getByRole('button', { name: `Add round ${round}` }).click();
  }
  await expect(page.getByRole('status').filter({ hasText: 'Player 1 wins on 540.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Round 4' })).toHaveCount(0);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('region', { name: 'Standings' }).getByRole('button', { name: 'New game' }).click();
  await expect(page.getByRole('heading', { name: 'Round 1' })).toBeVisible();
});

test('Spades scores partnerships, and Euchre the makers', async ({ page }) => {
  await page.goto('/score/card-deck/spades');
  const bids = [3, 4, 2, 2];
  const tricks = [4, 4, 2, 3];
  for (const [i, bid] of bids.entries()) {
    await page.getByRole('spinbutton', { name: `Player ${i + 1} bid` }).fill(String(bid));
    await page.getByRole('spinbutton', { name: `Player ${i + 1} tricks` }).fill(String(tricks[i]));
  }
  await expect(page.getByText('Player 1 & Player 3 +51 · Player 2 & Player 4 +61')).toBeVisible();
  await page.getByRole('button', { name: 'Add hand 1' }).click();
  await expect(page.getByRole('region', { name: 'Standings' }).getByText('1 bag')).toHaveCount(2);

  await page.goto('/score/card-deck/euchre');
  await page.getByRole('group', { name: 'Who chose trump?' }).getByRole('button', { name: 'Team 2' }).click();
  await page.getByRole('group', { name: 'Tricks they took' }).getByRole('button', { name: '5', exact: true }).click();
  await page.getByRole('checkbox', { name: 'One of them went alone' }).check();
  await page.getByRole('button', { name: 'Add hand 1' }).click();
  const total = page
    .getByRole('table', { name: 'Scores by hand' })
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Total' }) });
  await expect(total.getByRole('cell')).toHaveText(['0', '4']);
});

test("Ticket to Ride scores each player's routes and tickets on the map played", async ({ page }) => {
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
  const row = (name: string) =>
    sheet.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
  // Player 2's three stations, never built, are 12 more.
  await expect(row('Total').getByRole('cell')).toHaveText(['67', '52']);
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
