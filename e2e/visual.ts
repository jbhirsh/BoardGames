import type { Page } from '@playwright/test';
import { expect, CHAT_ANSWER } from './fixtures';

/**
 * Visual regression's pages and states (the visual*.spec.ts files), and how
 * each is shot. The visual-* projects in playwright.config.ts decide which
 * spec runs where: visual.spec.ts, the core pages in the light theme, in
 * every engine on a desktop and on phones; visual-full.spec.ts, everything
 * in both themes, in desktop Chromium; visual-phone.spec.ts, what only a
 * phone shows.
 *
 * Baselines are Linux CI's (fonts and anti-aliasing differ between
 * machines), in visual*.spec.ts-snapshots/: a run of e2e.yml by hand with
 * "update_snapshots" rewrites them and commits them to its branch. A change
 * meant to move pixels updates them in the same PR; any other diff is a
 * regression.
 */

export type Theme = 'light' | 'dark';

/** A state to shoot: `open` gets the page there and waits until it's up. */
export interface Scenario {
  name: string;
  open: (page: Page) => Promise<void>;
}

/** The system theme, and Math.random pinned, which picks the random pick and orders the hero. */
export async function prepare(page: Page, theme: Theme): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
}

/**
 * Shoots the window, or the whole page, once it has stopped changing: the
 * hero warmed up, every image loaded (lazy ones too, which a full-page shot
 * never scrolls to) and the fonts in. The projects' reduced motion holds the hero's row still.
 */
export async function shoot(page: Page, name: string, fullPage = false): Promise<void> {
  await settle(page);
  // Two shots in a row must match before one counts; a slow engine needs
  // longer than the default 5 s to get there.
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage, timeout: 15_000 });
}

/** Waits until the page has stopped changing on its own (see shoot), for any screenshot. */
export async function settle(page: Page): Promise<void> {
  // The hero asks for its later covers once the page has settled, and says
  // so on its list (data-warm, CoverCarousel); past that, nothing new
  // starts on its own. Pages without the hero have no such list.
  const reel = page.getByRole('list', { name: /^(Collection|Wishlist) covers$/ });
  if ((await reel.count()) > 0) await expect(reel).toHaveAttribute('data-warm', 'true');
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll('img')) img.loading = 'eager';
    await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
    await document.fonts.ready;
  });
}

/** Waits until the rulebook's first page is drawn and its search is ready. */
async function firstPageDrawn(page: Page): Promise<void> {
  const first = page.getByRole('group', { name: /^Page 1 of \d+$/ });
  await expect(first).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  // Its text is laid over the drawing once that is done (the canvas is
  // hidden from the accessibility tree, so the text is all the page holds).
  await expect(first.getByText(/\S/).first()).toBeAttached({ timeout: 15_000 });
}

/** Answers every dictionary lookup with one English noun sense. */
async function stubDefinition(page: Page, definition: string): Promise<void> {
  const body = JSON.stringify({ en: [{ partOfSpeech: 'Noun', language: 'English', definitions: [{ definition }] }] });
  await page.route('https://en.wiktionary.org/api/rest_v1/page/definition/*', (route) =>
    route.fulfill({ contentType: 'application/json', body }),
  );
}

/** The pages every engine shoots. */
export const CORE: Scenario[] = [
  {
    name: 'home-list',
    open: async (page) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Our Game Room' })).toBeVisible();
    },
  },
  {
    name: 'home-grid',
    open: async (page) => {
      await page.goto('/?v=grid');
      await expect(page.getByRole('heading', { level: 2, name: 'Our Collection' })).toBeVisible();
    },
  },
  {
    name: 'rules',
    open: async (page) => {
      await page.goto('/rules/catan');
      await firstPageDrawn(page);
    },
  },
  {
    name: 'score-7-wonders',
    open: async (page) => {
      await page.goto('/score/7-wonders');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    },
  },
  {
    name: 'word-checker',
    open: async (page) => {
      await page.goto('/word-checker');
      await expect(page.getByRole('heading', { level: 1, name: 'Word Checker' })).toBeVisible();
    },
  },
];

/** The rest of the app's states, shot in desktop Chromium. */
export const MORE: Scenario[] = [
  {
    name: 'wishlist',
    open: async (page) => {
      await page.goto('/?c=want');
      await expect(page.getByRole('heading', { level: 2, name: 'Wishlist' })).toBeVisible();
    },
  },
  {
    name: 'wishlist-grid',
    open: async (page) => {
      await page.goto('/?c=want&v=grid');
      await expect(page.getByRole('heading', { level: 2, name: 'Wishlist' })).toBeVisible();
    },
  },
  {
    name: 'filter-open',
    open: async (page) => {
      await page.goto('/?d=60&k=strategy');
      await page.getByRole('button', { name: 'Players', exact: true }).click();
      await expect(page.getByRole('radio', { name: '2 players' })).toBeVisible();
    },
  },
  {
    name: 'details-open',
    open: async (page) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Show details for Catan' }).click();
      const rules = page.getByRole('link', { name: 'Rules for Catan' });
      await expect(rules).toBeVisible();
      await rules.scrollIntoViewIfNeeded();
    },
  },
  {
    name: 'no-results',
    open: async (page) => {
      await page.goto('/?q=zzzzzz');
      await expect(page.getByText('No games match your filters.')).toBeVisible();
    },
  },
  {
    name: 'random-pick',
    open: async (page) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Pick for us' }).click();
      await expect(page.getByRole('dialog', { name: /^Tonight, play/ })).toBeVisible();
    },
  },
  {
    name: 'rules-chat',
    open: async (page) => {
      await page.goto('/rules/catan');
      await page.getByRole('button', { name: 'AI Rules Assistant' }).click();
      await page.getByPlaceholder('Ask a rules question...').fill('What happens when a 7 is rolled?');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByText(CHAT_ANSWER.replace(/\*\*/g, ''))).toBeVisible();
      await firstPageDrawn(page);
    },
  },
  {
    name: 'house-rules',
    open: async (page) => {
      await page.goto('/rules/hogwarts-battle');
      await page.getByText('House rules').click();
      await expect(page.getByRole('link', { name: /Monster Box 1/ })).toBeVisible();
      await firstPageDrawn(page);
    },
  },
  {
    name: 'score-ticket-to-ride',
    open: async (page) => {
      await page.goto('/score/ticket-to-ride');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    },
  },
  {
    name: 'score-dominion',
    open: async (page) => {
      await page.goto('/score/dominion');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    },
  },
  {
    name: 'score-hearts',
    open: async (page) => {
      await page.goto('/score/card-deck/hearts');
      for (const [i, name] of ['Ana', 'Ben', 'Cy'].entries()) await page.getByLabel(`Player ${i + 1} name`).fill(name);
      await page.getByRole('spinbutton', { name: 'Ana' }).fill('13');
      await page.getByRole('spinbutton', { name: 'Ben' }).fill('9');
      await page.getByRole('spinbutton', { name: 'Cy' }).fill('4');
      await page.getByRole('button', { name: /^Add hand/ }).click();
      await expect(page.getByRole('table', { name: 'Scores by hand' })).toBeVisible();
    },
  },
  {
    name: 'word-checked',
    open: async (page) => {
      await stubDefinition(page, 'A curved fruit.');
      await page.goto('/word-checker');
      await page.getByPlaceholder('Enter a word...').fill('banana');
      await page.getByRole('button', { name: 'Check' }).click();
      await expect(page.getByText('A curved fruit.')).toBeVisible();
    },
  },
  {
    name: 'sign-in',
    open: async (page) => {
      await page.goto('/sign-in');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    },
  },
  {
    name: 'not-found',
    open: async (page) => {
      await page.goto('/no-such-page');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    },
  },
];
