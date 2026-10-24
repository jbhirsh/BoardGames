import type { Page } from '@playwright/test';
import { test, expect, nextOperation, operationOf, stubOperation } from './fixtures';

// The pages the owner's emails link to. Opening one only reads (a query);
// nothing changes until its button is pressed, as a mail scanner's visit
// must change nothing.

const TOKEN = 'e2e-token-0000000000000000000001';

/** Every operation the page sends, by name, as it sends them. */
function sentOperations(page: Page): string[] {
  const names: string[] = [];
  page.on('request', (request) => {
    const op = operationOf(request);
    if (op) names.push(op.operationName);
  });
  return names;
}

test('the sign-in link signs this browser in only when Sign in is pressed', async ({ page }) => {
  await stubOperation(page, 'SignInLinkLive', () => ({ signInLinkLive: true }));
  await stubOperation(page, 'VerifySignIn', () => ({ verifySignIn: { admin: true } }));
  const sent = sentOperations(page);
  await page.goto(`/sign-in/confirm?token=${TOKEN}`);
  await expect(page.getByRole('heading', { name: 'Sign in to The Game Room?' })).toBeVisible();
  expect(sent).toEqual(['SignInLinkLive']);
  // The token leaves the address (and the history entry's URL) once read.
  await expect(page).toHaveURL(/\/sign-in\/confirm$/);

  const verified = nextOperation(page, 'VerifySignIn');
  await page.getByRole('button', { name: 'Sign in' }).click();
  expect(await verified).toEqual({ token: TOKEN });
  await expect(page).toHaveURL(/\/\?c=want$/);
});

test('a used sign-in link says so', async ({ page }) => {
  await stubOperation(page, 'SignInLinkLive', () => ({ signInLinkLive: false }));
  await page.goto(`/sign-in/confirm?token=${TOKEN}`);
  await expect(page.getByRole('heading', { name: 'Link expired' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0);
});

test('an approve link shows what BoardGameGeek has, and approves only when pressed', async ({ page }) => {
  await stubOperation(page, 'EmailedSuggestion', () => ({
    emailedSuggestion: {
      suggestion: { game: 'Faraway', name: 'Sam', note: 'Quick and clever', status: 'PENDING' },
      preview: {
        outcome: 'FOUND',
        details: {
          bggId: 385761,
          name: 'Faraway',
          year: 2023,
          min: 2,
          max: 6,
          mins: 30,
          desc: 'Explore Alula backwards.',
          kw: ['card-game'],
          img: null,
        },
      },
    },
  }));
  await stubOperation(page, 'DecideByLink', () => ({ decideSuggestion: { item: { game: 'Faraway' }, lookup: null } }));
  const sent = sentOperations(page);
  await page.goto(`/approve?id=sug-0e2eappr0001&token=${TOKEN}`);
  await expect(page.getByRole('heading', { name: 'Approve Faraway?' })).toBeVisible();
  await expect(page).toHaveURL(/\/approve\?id=sug-0e2eappr0001$/);
  await expect(page.getByText('Suggested by Sam', { exact: true })).toBeVisible();
  await expect(page.getByRole('blockquote')).toHaveText('“Quick and clever”');
  await expect(page.getByText('Explore Alula backwards.')).toBeVisible();
  expect(sent).toEqual(['EmailedSuggestion']);

  const decided = nextOperation(page, 'DecideByLink');
  await page.getByRole('button', { name: 'Approve' }).click();
  expect(await decided).toEqual({
    id: 'sug-0e2eappr0001',
    token: TOKEN,
    decision: 'APPROVE',
    game: 'Faraway',
    details: {
      bggId: 385761,
      year: 2023,
      min: 2,
      max: 6,
      mins: 30,
      desc: 'Explore Alula backwards.',
      kw: ['card-game'],
    },
  });
  await expect(page.getByRole('heading', { name: 'Approved' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Faraway is now on the wishlist, credited to Sam.');
});

test('a deny link denies only when pressed, and a used one says so', async ({ page }) => {
  let status = 'PENDING';
  await stubOperation(page, 'EmailedSuggestion', () => ({
    emailedSuggestion: { suggestion: { game: 'Faraway', name: 'Sam', note: '', status } },
  }));
  await stubOperation(page, 'DecideByLink', () => ({ decideSuggestion: { item: { game: 'Faraway' }, lookup: null } }));
  await page.goto(`/deny?id=sug-0e2eappr0001&token=${TOKEN}`);
  await expect(page.getByRole('heading', { name: 'Deny Faraway?' })).toBeVisible();
  const decided = nextOperation(page, 'DecideByLink');
  await page.getByRole('button', { name: 'Deny' }).click();
  expect(await decided).toEqual({ id: 'sug-0e2eappr0001', token: TOKEN, decision: 'DENY' });
  await expect(page.getByRole('status')).toHaveText("Faraway won't appear on the wishlist.");

  // A reload finds the token in the history entry, not the address.
  await expect(page).toHaveURL(/\/deny\?id=sug-0e2eappr0001$/);
  status = 'DENIED';
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Already denied' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deny' })).toHaveCount(0);
});
