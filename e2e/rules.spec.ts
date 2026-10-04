import { GAMES } from '../src/data/games';
import { test, expect, nextPost, CHAT_ANSWER } from './fixtures';

const GAME = 'Far-Out Questions';
const SLUG = 'far-out-questions';

test('a rules page shows the rulebook and the assistant answers a question', async ({ page, request }) => {
  await page.goto('/');
  await page.getByPlaceholder('Search games...').fill(GAME);
  await page.getByRole('button', { name: `Show details for ${GAME}` }).click();
  await page.getByRole('link', { name: 'Rules', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/rules/${SLUG}$`));
  await expect(page.getByRole('heading', { level: 1, name: GAME })).toBeVisible();

  const viewer = page.getByTitle(`${GAME} rules`);
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute('src', `/rules/${SLUG}.pdf`);
  // The file the viewer frames is really served by the build.
  const pdf = await request.get(`/rules/${SLUG}.pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  await expect(page.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('href', `/rules/${SLUG}.pdf`);

  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  await expect(page.getByText(`Hi! Ask me anything about the rules for ${GAME}.`)).toBeVisible();

  const question = 'Does everyone answer each question?';
  await page.getByPlaceholder('Ask a rules question...').fill(question);
  const sent = nextPost(page, '/api/chat');
  await page.getByRole('button', { name: 'Send' }).click();

  expect((await sent).postDataJSON()).toEqual({ slug: SLUG, message: question, history: [] });
  await expect(page.getByText(question)).toBeVisible();
  // The reply's Markdown is rendered, not shown raw.
  await expect(page.getByText('Yes. Every player answers each question, then you vote.')).toBeVisible();
  await expect(page.getByText('Every player', { exact: true })).toHaveRole('strong');
  await expect(page.getByText(CHAT_ANSWER)).toHaveCount(0);
  await expect(page.getByPlaceholder('Ask a rules question...')).toHaveValue('');
});

test('a game\'s house rules open above its rulebook, on every tab', async ({ page }) => {
  const rules = GAMES.find(g => g.slug === 'hogwarts-battle')!.houseRules!;
  await page.goto('/rules/hogwarts-battle');

  const first = page.getByText(rules[0].text);
  await expect(first).toBeHidden();
  await page.getByText('House rules').click();
  for (const r of rules) {
    await expect(page.getByText(r.name, { exact: true })).toBeVisible();
    await expect(page.getByText(r.text)).toBeVisible();
  }

  await page.getByRole('link', { name: /Monster Box 1/ }).click();
  await expect(page).toHaveURL(/\/rules\/hogwarts-battle\/monster-box-of-monsters$/);
  await expect(page.getByText('House rules')).toBeVisible();
});
