import type { Page } from '@playwright/test';
import { test, expect, stubOperation, answerStream } from './fixtures';
import { settle } from './visual';

/**
 * The README's screenshots (docs/screenshots/), taken by the "readme"
 * project, which playwright.config.ts adds only when README_SHOTS is set:
 * readme-screenshots.yml runs it after a UI change reaches main, and
 * jbhirsh/ci's readme-screenshots actions replace the ones that changed.
 * Same names, sizes and framing as the README shows; every /api call and
 * the dictionary stubbed (the README says so), the rest the real build.
 */

const OUT = 'readme-shots';

// Retina-sized, 1280 wide, as the README's images have always been.
test.use({
  viewport: { width: 1280, height: 832 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
  reducedMotion: 'reduce',
});

async function shot(page: Page, name: string): Promise<void> {
  await settle(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, animations: 'disabled', caret: 'hide' });
}

test('collection grid', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?v=grid');
  await expect(page.getByRole('heading', { level: 1, name: 'Our Game Room' })).toBeVisible();
  await shot(page, 'collection-grid');
});

test('list view', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Our Collection' })).toBeVisible();
  await shot(page, 'home');
});

test('rules assistant', async ({ page }) => {
  await stubOperation(page, 'AskRules', () =>
    answerStream(
      [
        'When a **7** is rolled, three things happen:',
        '',
        '1. Every player holding **more than 7 resource cards** must discard half (rounded down).',
        '2. The active player moves the **robber** onto any land hex, blocking it from producing.',
        '3. That player then **steals one random card** from an opponent with a settlement or city touching that hex.',
        '',
        'The robber stays put until the next 7 is rolled or a Knight card moves it.',
      ].join('\n'),
    ),
  );
  await page.goto('/rules/catan');
  await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
  await page.getByPlaceholder('Ask a rules question...').fill('What happens when a 7 is rolled?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('The robber stays put until the next 7 is rolled')).toBeVisible();
  // The reader below, loaded rather than "Loading the rulebook...".
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  await shot(page, 'rules-assistant');
});

test('word checker', async ({ page }) => {
  await page.route('https://en.wiktionary.org/api/rest_v1/page/definition/*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        en: [
          {
            partOfSpeech: 'Adjective',
            language: 'English',
            definitions: [
              {
                definition: 'Exceedingly idealistic; unrealistic and impractical.',
                parsedExamples: [{ example: 'a quixotic attempt to save the game night single-handedly' }],
              },
              { definition: 'Impulsive and often rashly unpredictable.' },
            ],
          },
        ],
      }),
    }),
  );
  await page.goto('/word-checker');
  await page.getByPlaceholder('Enter a word...').fill('quixotic');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Impulsive and often rashly unpredictable.')).toBeVisible();
  await shot(page, 'word-checker');
});

test('7 Wonders score calculator', async ({ page }) => {
  await page.goto('/score/7-wonders');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shot(page, 'score-calculator');
});
