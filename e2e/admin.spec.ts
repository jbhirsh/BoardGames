import type { Page } from '@playwright/test';
import { test, expect, nextOperation, stubOperation } from './fixtures';

// The owner's tools, signed in. These stubs go in after the fixture's, so
// Playwright tries them first: the session says admin, the queue holds what
// the test gives it (nothing by default), and a preview answers whatever the
// test gives it, for every name or name by name.

const FOUND = {
  bggId: 385761,
  name: 'Faraway',
  year: 2023,
  min: 2,
  max: 6,
  mins: 30,
  desc: 'Explore Alula backwards.',
  kw: ['card-game', 'quick-play'],
};

interface Preview {
  outcome: string;
  details?: object;
}
type PreviewStub = Preview | ((game: string) => Preview);

async function signInWithPreview(page: Page, preview: PreviewStub, pending: unknown[] = []): Promise<void> {
  await stubOperation(page, 'Session', () => ({ session: { admin: true } }));
  await stubOperation(page, 'PendingSuggestions', () => ({ pendingSuggestions: pending }));
  await stubOperation(page, 'PreviewGame', ({ game }) => {
    const { outcome, details } = typeof preview === 'function' ? preview(String(game)) : preview;
    return { previewGame: { outcome, details: details ? { year: null, img: null, ...details } : null } };
  });
  await stubOperation(page, 'DecideSuggestion', () => ({ decideSuggestion: { lookup: null } }));
  await stubOperation(page, 'AddGame', () => ({ addGame: { lookup: null } }));
}

test('the owner sees what BoardGameGeek found before adding a game', async ({ page }) => {
  await signInWithPreview(page, { outcome: 'FOUND', details: FOUND });
  await page.goto('/?c=want');
  const form = page.getByRole('form', { name: 'Add a game' });
  await form.getByLabel('Game').fill('Faraway');

  const looked = nextOperation(page, 'PreviewGame');
  await form.getByRole('button', { name: 'Look up' }).click();
  expect(await looked).toEqual({ game: 'Faraway' });
  await expect(form.getByText('Explore Alula backwards.')).toBeVisible();
  await expect(form.getByText('2–6 players · 30 min')).toBeVisible();

  const added = nextOperation(page, 'AddGame');
  await form.getByRole('button', { name: 'Add to wishlist' }).click();
  expect(await added).toMatchObject({
    game: 'Faraway',
    details: { bggId: 385761, mins: 30 },
  });
  await expect(form.getByRole('status')).toHaveText('Faraway is on the wishlist.');
});

test('the owner is told on the form when BoardGameGeek has no match, and can add it anyway', async ({ page }) => {
  await signInWithPreview(page, { outcome: 'NO_MATCH' });
  await page.goto('/?c=want');
  const form = page.getByRole('form', { name: 'Add a game' });
  await form.getByLabel('Game').fill('Magical Athlete');
  await form.getByRole('button', { name: 'Look up' }).click();
  await expect(form.getByText(/BoardGameGeek had no match for “Magical Athlete”/)).toBeVisible();

  const added = nextOperation(page, 'AddGame');
  await form.getByRole('button', { name: 'Add anyway' }).click();
  expect(await added).toMatchObject({ game: 'Magical Athlete', details: null });
  await expect(form.getByRole('status')).toHaveText('Magical Athlete is on the wishlist.');
});

test('the owner corrects a misspelt suggestion, sees what BoardGameGeek has for it, and approves it', async ({
  page,
}) => {
  const ARKHAM = {
    bggId: 15987,
    name: 'Arkham Horror',
    year: 2005,
    min: 1,
    max: 8,
    mins: 240,
    desc: 'Investigate the mysteries of Arkham.',
    kw: ['cooperative', 'thematic'],
  };
  const byName: Record<string, Preview> = {
    Faraway: { outcome: 'FOUND', details: FOUND },
    'Arkham Horror': { outcome: 'FOUND', details: ARKHAM },
  };
  await signInWithPreview(page, (game: string) => byName[game] ?? { outcome: 'NO_MATCH' }, [
    { id: 'sug-0e2efar00001', game: 'Faraway', name: 'Sam', note: '' },
    { id: 'sug-0e2earkh0001', game: 'Arkham Horry', name: 'Robin', note: 'Spooky' },
  ]);
  await page.goto('/?c=want');
  const queue = page.getByRole('region', { name: 'Owner tools' });

  // Each suggestion is looked up as the queue loads, in turn: one found, one a miss.
  await expect(queue.getByText('Explore Alula backwards.')).toBeVisible();
  await expect(queue.getByText(/BoardGameGeek had no match for “Arkham Horry”/)).toBeVisible();

  const approvedFaraway = nextOperation(page, 'DecideSuggestion');
  await queue.getByRole('button', { name: 'Approve Faraway' }).click();
  expect(await approvedFaraway).toEqual({
    decision: 'APPROVE',
    id: 'sug-0e2efar00001',
    details: {
      bggId: 385761,
      year: 2023,
      min: 2,
      max: 6,
      mins: 30,
      desc: 'Explore Alula backwards.',
      kw: ['card-game', 'quick-play'],
    },
  });
  await expect(queue.getByRole('textbox', { name: "Game name for Sam's suggestion “Faraway”" })).toBeHidden();

  const name = queue.getByRole('textbox', { name: "Game name for Robin's suggestion “Arkham Horry”" });
  await expect(name).toHaveValue('Arkham Horry');
  await name.fill('Arkham Horror');
  await expect(queue.getByText(/had no match/)).toBeHidden();
  const looked = nextOperation(page, 'PreviewGame');
  await queue.getByRole('button', { name: "Look up the name for Robin's suggestion “Arkham Horry”" }).click();
  expect(await looked).toEqual({ game: 'Arkham Horror' });
  await expect(queue.getByText('Investigate the mysteries of Arkham.')).toBeVisible();
  await expect(queue.getByText('1–8 players · 240 min')).toBeVisible();

  const approved = nextOperation(page, 'DecideSuggestion');
  // Approve is named by the corrected name now.
  await queue.getByRole('button', { name: 'Approve Arkham Horror' }).click();
  expect(await approved).toEqual({
    decision: 'APPROVE',
    id: 'sug-0e2earkh0001',
    game: 'Arkham Horror',
    details: {
      bggId: 15987,
      year: 2005,
      min: 1,
      max: 8,
      mins: 240,
      desc: 'Investigate the mysteries of Arkham.',
      kw: ['cooperative', 'thematic'],
    },
  });
  await expect(queue.getByText('Nothing waiting.')).toBeVisible();
});
