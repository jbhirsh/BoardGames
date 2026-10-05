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

test('a rate-limited question comes back to the box and Retry asks it again', async ({ page }) => {
  // The first ask is rate limited; the retry falls through to the fixture's answer.
  let asked = 0;
  await page.route('**/api/chat', (route) =>
    asked++ === 0
      ? route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"Too many requests."}' })
      : route.fallback(),
  );
  await page.goto(`/rules/${SLUG}`);
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();

  const box = page.getByPlaceholder('Ask a rules question...');
  const question = 'Does everyone answer each question?';
  await box.fill(question);
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByRole('alert')).toHaveText(/Too many questions just now/);
  await expect(box).toHaveValue(question);

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Yes. Every player answers each question, then you vote.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText(question)).toHaveCount(1);
});

test('under a players filter, Rules opens the add-on the game fits through', async ({ page }) => {
  // Catan seats 3–4; at five it is listed for its 5–6 Player Extension.
  await page.goto('/?q=catan&p=5&v=grid');
  await page.getByRole('link', { name: 'Rules', exact: true }).click();
  await expect(page).toHaveURL(/\/rules\/catan\/5-6-player-extension$/);
});

test('an answer that names another rulebook links to its tab', async ({ page }) => {
  await page.route('**/api/chat', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: "That's in the 5 6 Player Extension." }),
  );
  await page.goto('/rules/catan');
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  await page.getByPlaceholder('Ask a rules question...').fill('How do we play with five?');
  await page.getByRole('button', { name: 'Send' }).click();

  await page.getByRole('link', { name: 'Open 5–6 Player Extension' }).click();
  await expect(page).toHaveURL(/\/rules\/catan\/5-6-player-extension$/);
});

test('a starter question asks itself, and a game with a calculator links to it', async ({ page }) => {
  await page.goto('/rules/7-wonders');
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  const starters = page.getByRole('group', { name: 'Try asking' });
  const sent = nextPost(page, '/api/chat');
  await starters.getByRole('button', { name: 'How does a turn go?' }).click();

  expect((await sent).postDataJSON()).toEqual({ slug: '7-wonders', message: 'How does a turn go?', history: [] });
  await expect(page.getByText('Yes. Every player answers each question, then you vote.')).toBeVisible();
  await expect(starters).toHaveCount(0);

  await page.getByRole('link', { name: 'Score calculator' }).click();
  await expect(page).toHaveURL(/\/score\/7-wonders$/);
});
