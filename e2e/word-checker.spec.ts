import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const DICTIONARY = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

/** Answers every dictionary lookup with `status` and `body`; resolves with the words asked for. */
async function stubDictionary(page: Page, status: number, body: unknown): Promise<string[]> {
  const asked: string[] = [];
  await page.route(`${DICTIONARY}*`, (route) => {
    asked.push(decodeURIComponent(route.request().url().slice(DICTIONARY.length)));
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return asked;
}

async function check(page: Page, word: string) {
  await page.goto('/word-checker');
  await expect(page.getByRole('heading', { level: 1, name: 'Word Checker' })).toBeVisible();
  await page.getByPlaceholder('Enter a word...').fill(word);
  await page.getByRole('button', { name: 'Check' }).click();
}

test('a dictionary word is valid and shows its definition', async ({ page }) => {
  const asked = await stubDictionary(page, 200, [{
    phonetic: '/bəˈnɑːnə/',
    meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'An elongated curved tropical fruit.' }] }],
  }]);

  await check(page, '  Banana ');

  await expect(page.getByText('Valid word', { exact: true })).toBeVisible();
  await expect(page.getByText('banana', { exact: true })).toBeVisible();
  await expect(page.getByText('noun', { exact: true })).toBeVisible();
  await expect(page.getByText('An elongated curved tropical fruit.')).toBeVisible();
  // Trimmed and lowercased before the lookup.
  expect(asked).toEqual(['banana']);
});

test('a word the dictionary does not know (404) is not valid', async ({ page }) => {
  const asked = await stubDictionary(page, 404, { title: 'No Definitions Found' });

  await check(page, 'qzxv');

  await expect(page.getByText('Not a valid word', { exact: true })).toBeVisible();
  await expect(page.getByText('Valid word', { exact: true })).toHaveCount(0);
  expect(asked).toEqual(['qzxv']);
});

test('a dictionary outage still answers from the word-game list', async ({ page }) => {
  await stubDictionary(page, 503, { message: 'Service Unavailable' });

  // Both in ENABLE (public/words/enable.txt), so no dictionary is needed.
  await check(page, 'banana');
  await expect(page.getByText('Valid word', { exact: true })).toBeVisible();
  await expect(page.getByText("Couldn't check right now", { exact: true })).toHaveCount(0);

  // Not in the list, and the dictionary can't double-check.
  await page.getByPlaceholder('Enter a word...').fill('teh');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Not a valid word', { exact: true })).toBeVisible();
  await expect(page.getByText(/couldn't be reached to double-check/)).toBeVisible();
});

test('a word-game word missing from the list is valid when the dictionary has it', async ({ page }) => {
  const asked = await stubDictionary(page, 200, [{
    meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'Vital energy in Chinese philosophy.' }] }],
  }]);

  await check(page, 'qi');

  await expect(page.getByText('Valid word', { exact: true })).toBeVisible();
  await expect(page.getByText('Not in the word-game list, but the dictionary has it.')).toBeVisible();
  expect(asked).toEqual(['qi']);
});
