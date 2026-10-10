import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const DICTIONARY = 'https://en.wiktionary.org/api/rest_v1/page/definition/';

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
  const asked = await stubDictionary(page, 200, {
    en: [{
      partOfSpeech: 'Noun',
      language: 'English',
      definitions: [{ definition: 'An elongated curved tropical <a rel="mw:WikiLink" href="/wiki/fruit">fruit</a>.' }],
    }],
  });

  await check(page, '  Banana ');

  await expect(page.getByText('Valid word', { exact: true })).toBeVisible();
  await expect(page.getByText('banana', { exact: true })).toBeVisible();
  await expect(page.getByText('noun', { exact: true })).toBeVisible();
  await expect(page.getByText('An elongated curved tropical fruit.')).toBeVisible();
  await expect(page.getByText('Definitions from Wiktionary (CC BY-SA 4.0), shortened')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Wiktionary', exact: true }))
    .toHaveAttribute('href', 'https://en.wiktionary.org/wiki/banana');
  await expect(page.getByRole('link', { name: 'CC BY-SA 4.0' }))
    .toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
  // Trimmed and lowercased before the lookup.
  expect(asked).toEqual(['banana']);
});

test('a word the dictionary does not know (404) is not valid', async ({ page }) => {
  const asked = await stubDictionary(page, 404, { status: 404, type: 'Internal error' });

  await check(page, 'qzxv');

  await expect(page.getByText('Not a valid word', { exact: true })).toBeVisible();
  await expect(page.getByText('Valid word', { exact: true })).toHaveCount(0);
  expect(asked).toEqual(['qzxv']);
});

test('a lone letter gets a note, not a verdict, and no lookup', async ({ page }) => {
  const asked = await stubDictionary(page, 200, { en: [{ partOfSpeech: 'Article', language: 'English', definitions: [{ definition: 'One.' }] }] });

  await check(page, 'a');

  await expect(page.getByRole('status').filter({ hasText: 'Words need at least two letters.' })).toBeVisible();
  await expect(page.getByText('Valid word', { exact: true })).toHaveCount(0);
  expect(asked).toEqual([]);
});

test('a word Wiktionary has only as a misspelling is not valid', async ({ page }) => {
  await stubDictionary(page, 200, {
    en: [
      { partOfSpeech: 'Symbol', language: 'Translingual', definitions: [{ definition: 'ISO 639-3 language code for Tehuelche.' }] },
      { partOfSpeech: 'Article', language: 'English', definitions: [{ definition: 'Deliberate misspelling of <a href="/wiki/the">the</a>.' }] },
    ],
  });

  await check(page, 'teh');

  await expect(page.getByText('Not a valid word', { exact: true })).toBeVisible();
});

test('a dictionary outage still answers from the word-game list', async ({ page }) => {
  await stubDictionary(page, 503, { message: 'Service Unavailable' });

  // Both in ENABLE (public/words/enable.txt), so no dictionary is needed.
  await check(page, 'banana');
  await expect(page.getByText('Valid word', { exact: true })).toBeVisible();
  await expect(page.getByText("Couldn't check right now", { exact: true })).toHaveCount(0);

  // Newer word-game words come from the bundled additions, not the dictionary.
  for (const word of ['qi', 'za', 'ok']) {
    await page.getByPlaceholder('Enter a word...').fill(word);
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText(word, { exact: true })).toBeVisible();
    await expect(page.getByText('Valid word', { exact: true })).toBeVisible();
  }

  // Not in the list, and the dictionary can't double-check: a warning, never a red ✗.
  await page.getByPlaceholder('Enter a word...').fill('teh');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Not in our word list', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: "couldn't be reached to double-check" })).toBeVisible();
  await expect(page.getByText('Not a valid word', { exact: true })).toHaveCount(0);
});

test('a word missing from both lists is valid when the dictionary has it', async ({ page }) => {
  const asked = await stubDictionary(page, 200, {
    en: [{ partOfSpeech: 'Verb', language: 'English', definitions: [{ definition: 'To keep scrolling through bad news.' }] }],
  });

  await check(page, 'doomscroll');

  await expect(page.getByText('Valid word', { exact: true })).toBeVisible();
  await expect(page.getByText('Not in our word list, but the dictionary has it.')).toBeVisible();
  expect(asked).toEqual(['doomscroll']);
});
