import type { Page } from '@playwright/test';
import { test, expect, nextPost } from './fixtures';

// The owner's add form, signed in. These stubs go in after the fixture's,
// so Playwright tries them first: /api/auth says admin, the queue is empty,
// and a preview answers whatever the test gives it.

const FOUND = {
  bggId: 385761, name: 'Faraway', year: 2023, min: 2, max: 6, mins: 30,
  desc: 'Explore Alula backwards.', kw: ['card-game', 'quick-play'],
};

async function signInWithPreview(page: Page, preview: unknown): Promise<void> {
  await page.route((url) => url.pathname === '/api/auth', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: { admin: true } }) : route.fallback(),
  );
  await page.route((url) => url.pathname === '/api/suggestions', (route) => {
    const request = route.request();
    if (request.method() === 'GET' && new URL(request.url()).searchParams.get('action') === 'pending') {
      return route.fulfill({ json: { items: [] } });
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { action?: string; game?: string };
      if (body.action === 'preview') return route.fulfill({ json: preview });
      if (body.action === 'add') return route.fulfill({ status: 201, json: { item: { id: 'sug-0e2eadd0e2ea', game: body.game } } });
    }
    return route.fallback();
  });
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
  expect((await added).postDataJSON()).toMatchObject({ action: 'add', game: 'Faraway', details: { bggId: 385761, mins: 30 } });
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
