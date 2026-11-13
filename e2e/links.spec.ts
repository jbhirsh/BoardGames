import type { Page } from '@playwright/test';
import { test, expect, nextOperation, operationOf, stubOperation } from './fixtures';

// The pages the owner's emails link to. Opening one only reads (a query),
// and only for the signed-in owner; nothing changes until its button is
// pressed, as a mail scanner's visit must change nothing.

/** Signs the page in as the owner. */
const asOwner = (page: Page) => stubOperation(page, 'Session', () => ({ session: { admin: true } }));

/** Every operation the page sends, by name, as it sends them. */
function sentOperations(page: Page): string[] {
  const names: string[] = [];
  page.on('request', (request) => {
    const op = operationOf(request);
    if (op) names.push(op.operationName);
  });
  return names;
}

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
          weight: null,
          section: 'party',
          summary: null,
          honours: [],
        },
      },
    },
  }));
  await asOwner(page);
  await stubOperation(page, 'DecideByLink', () => ({ decideSuggestion: { item: { game: 'Faraway' }, lookup: null } }));
  const sent = sentOperations(page);
  await page.goto('/approve?id=sug-0e2eappr0001');
  await expect(page.getByRole('heading', { name: 'Approve Faraway?' })).toBeVisible();
  await expect(page.getByText('Suggested by Sam', { exact: true })).toBeVisible();
  await expect(page.getByRole('blockquote')).toHaveText('“Quick and clever”');
  await expect(page.getByText('Explore Alula backwards.')).toBeVisible();
  // The page asks for the session and, as every page does, the games query.
  expect(sent.filter((name) => name !== 'Session' && name !== 'Games')).toEqual(['EmailedSuggestion']);

  const decided = nextOperation(page, 'DecideByLink');
  await page.getByRole('button', { name: 'Approve' }).click();
  expect(await decided).toEqual({
    id: 'sug-0e2eappr0001',
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
      section: 'party',
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
  await asOwner(page);
  await page.goto('/deny?id=sug-0e2eappr0001');
  await expect(page.getByRole('heading', { name: 'Deny Faraway?' })).toBeVisible();
  const decided = nextOperation(page, 'DecideByLink');
  await page.getByRole('button', { name: 'Deny' }).click();
  expect(await decided).toEqual({ id: 'sug-0e2eappr0001', decision: 'DENY' });
  await expect(page.getByRole('status')).toHaveText("Faraway won't appear on the wishlist.");

  status = 'DENIED';
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Already denied' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deny' })).toHaveCount(0);
});

test('an emailed link opened signed out reads nothing and offers sign-in', async ({ page }) => {
  const sent = sentOperations(page);
  await page.goto('/approve?id=sug-0e2eappr0001');
  await expect(page.getByText('Sign in as the owner to see this suggestion and decide it.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible();
  expect(sent.filter((name) => name !== 'Session' && name !== 'Games')).toEqual([]);
});
