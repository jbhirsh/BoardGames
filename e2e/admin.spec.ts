import type { Page } from '@playwright/test';
import { test, expect, nextPost } from './fixtures';

// The owner's tools, signed in. These stubs go in after the fixture's, so
// Playwright tries them first: /api/auth says admin, the queue holds what
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

type PreviewStub = unknown | ((game: string) => unknown);

async function signInWithPreview(page: Page, preview: PreviewStub, pending: unknown[] = []): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/auth',
    (route) => (route.request().method() === 'GET' ? route.fulfill({ json: { admin: true } }) : route.fallback()),
  );
  await page.route(
    (url) => url.pathname === '/api/suggestions',
    (route) => {
      const request = route.request();
      if (request.method() === 'GET' && new URL(request.url()).searchParams.get('action') === 'pending') {
        return route.fulfill({ json: { items: pending } });
      }
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as { action?: string; game?: string; decision?: string; id?: string };
        if (body.action === 'preview')
          return route.fulfill({ json: typeof preview === 'function' ? preview(body.game ?? '') : preview });
        if (body.decision === 'approve')
          return route.fulfill({ json: { item: { id: body.id, game: body.game, status: 'approved' } } });
        if (body.action === 'add')
          return route.fulfill({ status: 201, json: { item: { id: 'sug-0e2eadd0e2ea', game: body.game } } });
      }
      return route.fallback();
    },
  );
}

test('the owner sees what BoardGameGeek found before adding a game', async ({ page }) => {
  await signInWithPreview(page, { outcome: 'found', details: FOUND });
  await page.goto('/?c=want');
  const form = page.getByRole('form', { name: 'Add a game' });
  await form.getByLabel('Game').fill('Faraway');

  const looked = nextPost(page, '/api/suggestions');
  await form.getByRole('button', { name: 'Look up' }).click();
  expect((await looked).postDataJSON()).toEqual({ action: 'preview', game: 'Faraway' });
  await expect(form.getByText('Explore Alula backwards.')).toBeVisible();
  await expect(form.getByText('2–6 players · 30 min')).toBeVisible();

  const added = nextPost(page, '/api/suggestions');
  await form.getByRole('button', { name: 'Add to wishlist' }).click();
  expect((await added).postDataJSON()).toMatchObject({
    action: 'add',
    game: 'Faraway',
    details: { bggId: 385761, mins: 30 },
  });
  await expect(form.getByRole('status')).toHaveText('Faraway is on the wishlist.');
});

test('the owner is told on the form when BoardGameGeek has no match, and can add it anyway', async ({ page }) => {
  await signInWithPreview(page, { outcome: 'no-match' });
  await page.goto('/?c=want');
  const form = page.getByRole('form', { name: 'Add a game' });
  await form.getByLabel('Game').fill('Magical Athlete');
  await form.getByRole('button', { name: 'Look up' }).click();
  await expect(form.getByText(/BoardGameGeek had no match for “Magical Athlete”/)).toBeVisible();

  const added = nextPost(page, '/api/suggestions');
  await form.getByRole('button', { name: 'Add anyway' }).click();
  expect((await added).postDataJSON()).toMatchObject({ action: 'add', game: 'Magical Athlete', details: null });
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
  const byName: Record<string, unknown> = {
    Faraway: { outcome: 'found', details: FOUND },
    'Arkham Horror': { outcome: 'found', details: ARKHAM },
  };
  await signInWithPreview(page, (game: string) => byName[game] ?? { outcome: 'no-match' }, [
    { id: 'sug-0e2efar00001', game: 'Faraway', name: 'Sam', note: '' },
    { id: 'sug-0e2earkh0001', game: 'Arkham Horry', name: 'Robin', note: 'Spooky' },
  ]);
  await page.goto('/?c=want');
  const queue = page.getByRole('region', { name: 'Owner tools' });

  // Each suggestion is looked up as the queue loads, in turn: one found, one a miss.
  await expect(queue.getByText('Explore Alula backwards.')).toBeVisible();
  await expect(queue.getByText(/BoardGameGeek had no match for “Arkham Horry”/)).toBeVisible();

  const approvedFaraway = nextPost(page, '/api/suggestions');
  await queue.getByRole('button', { name: 'Approve Faraway' }).click();
  expect((await approvedFaraway).postDataJSON()).toEqual({
    decision: 'approve',
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
  const looked = nextPost(page, '/api/suggestions');
  await queue.getByRole('button', { name: "Look up the name for Robin's suggestion “Arkham Horry”" }).click();
  expect((await looked).postDataJSON()).toEqual({ action: 'preview', game: 'Arkham Horror' });
  await expect(queue.getByText('Investigate the mysteries of Arkham.')).toBeVisible();
  await expect(queue.getByText('1–8 players · 240 min')).toBeVisible();

  const approved = nextPost(page, '/api/suggestions');
  // Approve is named by the corrected name now.
  await queue.getByRole('button', { name: 'Approve Arkham Horror' }).click();
  expect((await approved).postDataJSON()).toEqual({
    decision: 'approve',
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
