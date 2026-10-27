import { createRequire } from 'node:module';
import type { Locator, Page } from '@playwright/test';
import { GAMES } from '../src/data/games';
import { WISHLIST } from '../src/data/wishlist';
import { test, expect } from './fixtures';

// The home page on a phone: this file runs on the "phone" project, the
// newest iPhone Pro's window (playwright.config.ts).

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/** The bar along the bottom of the screen. */
const bar = (page: Page) => page.getByRole('navigation', { name: 'Which games to show' });

test('the list is a line a game, which opens in place; Rules inside opens the rules page and Back finds it open', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Show details for / })).toHaveCount(GAMES.length);
  // Ten lines where three cards fitted: the first few are on screen together.
  for (const name of ['7 Wonders', 'Analyze Me', 'Azul', 'Bananagrams']) {
    await expect(page.getByRole('heading', { level: 3, name })).toBeInViewport();
  }

  const azul = page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3, name: 'Azul' }) });
  await azul.getByRole('button', { name: 'Show details for Azul' }).click();
  const open = azul.getByRole('button', { name: 'Hide details for Azul' });
  await expect(open).toHaveAttribute('aria-expanded', 'true');
  await expect(azul.getByRole('heading', { name: 'Awards' })).toBeVisible();

  await azul.getByRole('link', { name: 'Rules for Azul' }).click();
  await expect(page).toHaveURL(/\/rules\/azul$/);
  await page.getByRole('link', { name: /Back to The Game Room/ }).click();
  await expect(open).toHaveAttribute('aria-expanded', 'true');
});

test('a line opening never scrolls inside itself, so a tap on what it shows stays where it was aimed', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByPlaceholder('Search games...').fill('Uno');
  await expect(page.getByRole('button', { name: /^Show details for / })).toHaveCount(1);
  await page.getByRole('button', { name: 'Show details for Uno' }).click();
  // While it grows, its last link is still clipped. Bringing it into view
  // (as a tap's scroll does) must move the page, not scroll the growing box,
  // which the rest of its growth would undo under the tap: Score's tap once
  // landed on the rules text that way.
  const scrolled = await page.getByRole('link', { name: 'Score', exact: true }).evaluate((link) => {
    link.scrollIntoView({ block: 'center' });
    let box = link.parentElement;
    while (box && getComputedStyle(box).overflowY === 'visible') box = box.parentElement;
    return box?.scrollTop ?? 0;
  });
  expect(scrolled).toBe(0);
});

test('cards are still a choice, and the choice is kept in the link', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Show as cards' }).click();
  await expect(page).toHaveURL(/\?v=grid$/);
  await page.getByRole('button', { name: 'More about Azul' }).click();
  await expect(page.getByRole('button', { name: 'Less about Azul' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('heading', { name: 'Awards' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'More about Azul' })).toBeVisible();
});

test('the bar along the bottom stays on screen, its buttons centred in it, and switches the lists', async ({
  page,
}) => {
  await page.goto('/');
  const nav = bar(page);
  const viewport = page.viewportSize()!;
  const centredInBar = async () => {
    const box = (await nav.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(viewport.height);
    for (const button of await nav.getByRole('button').filter({ visible: true }).all()) {
      const b = (await button.boundingBox())!;
      expect(Math.abs(b.y + b.height / 2 - (box.y + box.height / 2)), await button.innerText()).toBeLessThanOrEqual(1);
    }
  };
  await centredInBar();
  await page.getByRole('heading', { level: 3, name: 'Pandemic' }).scrollIntoViewIfNeeded();
  await expect(nav).toBeInViewport();
  await centredInBar();

  // Pick for us picks from where a thumb is.
  await nav.getByRole('button', { name: 'Pick for us' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Pick again' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(nav.getByRole('button', { name: 'Pick for us' })).toBeFocused();

  await nav.getByRole('button', { name: 'We want' }).click();
  await expect(nav.getByRole('button', { name: 'We want' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { level: 2, name: 'Wishlist' })).toBeInViewport();
  await expect(page.getByRole('heading', { name: WISHLIST[0].name })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Pick for us' })).toHaveCount(0);

  // Suggest a game goes to the form, which the page's end scrolls clear of the bar.
  await nav.getByRole('button', { name: 'Suggest a game' }).click();
  const field = page.getByLabel('Game', { exact: true });
  await expect(field).toBeFocused();
  // Ready to type, the keyboard up, so the bar has stepped aside.
  await expect(nav).toBeHidden();
  await field.blur();
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  const send = (await page.getByRole('button', { name: 'Send suggestion' }).boundingBox())!;
  expect(send.y + send.height).toBeLessThanOrEqual((await nav.boundingBox())!.y);

  await nav.getByRole('button', { name: 'We own' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Our Collection' })).toBeInViewport();
});

test('what takes focus scrolls clear of the bar', async ({ page }) => {
  await page.goto('/');
  // Pandemic's line just above the screen's bottom edge, under the bar,
  // and focus on the line before it: Tab moves on to Pandemic's.
  const next = page.getByRole('button', { name: 'Show details for Pandemic' });
  await next.evaluate((el) => {
    window.scrollBy({ top: el.getBoundingClientRect().bottom - window.innerHeight + 20, behavior: 'instant' });
  });
  await page
    .getByRole('button', { name: 'Show details for One Night Werewolf' })
    .evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
  await page.keyboard.press('Tab');
  await expect(next).toBeFocused();
  await expect
    .poll(async () => {
      const box = (await next.boundingBox())!;
      return box.y + box.height <= (await bar(page).boundingBox())!.y;
    })
    .toBe(true);
});

test('the heading keeps one line from 360px, and the bar its one-line labels at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  const title = (await page.getByRole('heading', { level: 2, name: 'Our Collection' }).boundingBox())!;
  const toggle = (await page.getByRole('button', { name: 'Show as cards' }).boundingBox())!;
  expect(toggle.y).toBeLessThan(title.y + title.height);

  await page.setViewportSize({ width: 320, height: 640 });
  for (const mode of ['own', 'want'] as const) {
    await page.goto(mode === 'want' ? '/?c=want' : '/');
    for (const name of ['We own', 'We want']) {
      const tab = bar(page).getByRole('button', { name });
      // Icon over a one-line label, inside the tab.
      expect(
        await tab.evaluate((el) => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth),
        `${name} on ${mode}`,
      ).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});

test('the bar steps aside while the keyboard is up for the search', async ({ page }) => {
  await page.goto('/');
  await expect(bar(page)).toBeVisible();
  await page.getByPlaceholder('Search games...').fill('Azul');
  await expect(bar(page)).toBeHidden();
  await page.getByPlaceholder('Search games...').blur();
  await expect(bar(page)).toBeVisible();
});

/**
 * How far a control takes taps each way: its own box, and the invisible
 * area a smaller one carries around it (tapTargetClass). Probes out from its
 * centre, a pixel at a time, for the element a tap there would reach.
 */
const tapArea = (control: Locator) =>
  control.evaluate((el: Element) => {
    const r = el.getBoundingClientRect();
    const [cx, cy] = [r.x + r.width / 2, r.y + r.height / 2];
    const hits = (x: number, y: number) => {
      const at = document.elementFromPoint(x, y);
      return at !== null && el.contains(at);
    };
    const reach = (dx: number, dy: number) => {
      let d = 0;
      while (d < 40 && hits(cx + dx * (d + 1), cy + dy * (d + 1))) d++;
      return d;
    };
    return { width: reach(-1, 0) + reach(1, 0) + 1, height: reach(0, -1) + reach(0, 1) + 1 };
  });

const takesTaps44 = async (controls: Locator[]) => {
  for (const control of controls) {
    await control.scrollIntoViewIfNeeded();
    const area = await tapArea(control);
    const name = await control.evaluate((el: Element) => el.getAttribute('aria-label') ?? el.textContent ?? '');
    expect(area.height, name).toBeGreaterThanOrEqual(44);
    expect(area.width, name).toBeGreaterThanOrEqual(44);
  }
};

test('the top of the page leaves room for four games: the title beside the theme picker, small covers under it', async ({
  page,
}) => {
  await page.goto('/');
  const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
  const picker = (await page.getByRole('radio', { name: 'Dark' }).boundingBox())!;
  expect(picker.y).toBeLessThan(title.y + title.height);
  expect(picker.y + picker.height).toBeGreaterThan(title.y);
  // The reel's pause button sits over the covers' row, keeps its small
  // circle, and takes a tap beside it.
  const pause = page.getByRole('button', { name: /^(Pause|Play)/ });
  const box = (await pause.boundingBox())!;
  const row = (await page.getByRole('list', { name: 'Collection covers' }).boundingBox())!;
  expect(box.y).toBeGreaterThan(row.y);
  expect(box.y + box.height).toBeLessThan(row.y + row.height);
  await page.mouse.click(box.x - 8, box.y + box.height / 2);
  await expect(page.getByRole('button', { name: /^Play/ })).toBeVisible();
  // Under Safari's bars (the project's 681px window), the fourth line ends
  // above the bar along the bottom.
  const fourth = (await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { level: 3, name: 'Bananagrams' }) })
    .boundingBox())!;
  expect(fourth.y + fourth.height).toBeLessThanOrEqual((await bar(page).boundingBox())!.y);
});

test('the controls on the page take taps 44px each way, a small one beyond its look', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Show details for Azul' }).click();
  // The search keeps iOS's own search field's 36px: a text field can't
  // carry a tap area beyond its box.
  expect((await page.getByPlaceholder('Search games...').boundingBox())!.height).toBeGreaterThanOrEqual(36);
  const filters = page.getByRole('button', { name: /^Filters/ });
  expect((await filters.boundingBox())!.height).toBeLessThan(44);
  await takesTaps44([
    filters,
    page.getByRole('button', { name: 'Show as cards' }),
    page.getByRole('button', { name: 'Hide details for Azul' }),
    page.getByRole('link', { name: 'Rules for Azul' }),
    page.getByRole('link', { name: /Watch Azul tutorial/ }),
    ...(await bar(page).getByRole('button').filter({ visible: true }).all()),
  ]);
  // The theme picker keeps its small pill, and each option takes a tap
  // just under it.
  const dark = page.getByRole('radio', { name: 'Dark' });
  await dark.scrollIntoViewIfNeeded();
  const option = (await dark.boundingBox())!;
  await page.mouse.click(option.x + option.width / 2, option.y + option.height + 5);
  await expect(dark).toHaveAttribute('aria-checked', 'true');
});

test("a score pad's and the rules page's small controls take taps 44px each way", async ({ page }) => {
  // Each page loads after its placeholder, whose Back link it replaces.
  await page.goto('/score/7-wonders');
  await expect(page.getByRole('button', { name: 'Results' })).toBeVisible();
  await takesTaps44([
    page.getByRole('link', { name: /Back to The Game Room/ }),
    page.getByRole('button', { name: 'Player 1' }),
    page.getByRole('button', { name: 'Add player' }),
    page.getByRole('button', { name: 'Results' }),
  ]);
  await page.goto('/rules/azul');
  await expect(page.getByPlaceholder('Search the rulebook')).toBeVisible();
  await takesTaps44([
    page.getByRole('link', { name: /Back to The Game Room/ }),
    page.getByRole('button', { name: /AI Rules Assistant/ }),
  ]);
});

test('a wishlist line votes from where it sits, without opening', async ({ page }) => {
  await page.goto('/?c=want');
  const name = WISHLIST[0].name;
  const vote = page.getByRole('button', { name: new RegExp(`^Vote for ${name} `) });
  await vote.click();
  await expect(page.getByRole('button', { name: new RegExp(`^Voted for ${name} `) })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: `Show details for ${name}` })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

// theme.spec.ts checks the desktop's pages; these are the phone's own: the
// bar, the lines and an open one, in either list.
for (const scheme of ['light', 'dark'] as const) {
  test(`the bar and the lines keep a readable contrast in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [url, open] of [
      ['/', 'Catan'],
      ['/?c=want', WISHLIST[0].name],
    ] as const) {
      await page.goto(url);
      await page.getByRole('button', { name: `Show details for ${open}` }).click();
      await expect(page.getByRole('button', { name: `Hide details for ${open}` })).toBeVisible();
      await page.addScriptTag({ path: axePath });
      const failures = await page.evaluate(async () => {
        const axe = (
          window as unknown as {
            axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { nodes: { target: string[] }[] }[] }> };
          }
        ).axe;
        const result = await axe.run(document, { runOnly: ['color-contrast'] });
        return result.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')));
      });
      expect(failures, url).toEqual([]);
    }
  });
}

test('filters live in a sheet behind one button and survive a reload', async ({ page }) => {
  await page.goto('/');
  const filters = page.getByRole('button', { name: /^Filters/ });
  await expect(filters).toHaveText('Filters');
  await expect(page.getByRole('button', { name: 'Duration', exact: true })).toHaveCount(0);

  await filters.click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await expect(sheet).toBeFocused();
  await sheet.getByRole('radio', { name: 'Up to 15 min' }).click();
  await sheet.getByRole('radio', { name: '2 players' }).click();
  // Picks apply as they are made; the sheet stays open and says how many fit.
  await expect(page).toHaveURL(/\/\?d=15&p=2$/);
  await expect(sheet.getByRole('button', { name: /^Show \d+ games?$/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(filters).toBeFocused();
  await expect(filters).toHaveText('Filters · 2');
  // Bananagrams is 2–8 players in 15 minutes; Cranium needs four and an hour.
  await expect(page.getByRole('heading', { level: 3, name: 'Bananagrams' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Cranium' })).toHaveCount(0);

  // The bar stays on screen down the list; the tags that repeat it scroll
  // with the page. (Six lines are too short a page to scroll them off it.)
  const tag = page.getByRole('button', { name: '2 players ✕' });
  const tagTop = (await tag.boundingBox())!.y;
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(0);
  await expect(filters).toBeInViewport();
  await expect.poll(async () => Math.round((await tag.boundingBox())!.y)).toBe(Math.round(tagTop - scrolled));

  // Narrowing from down the list brings the shorter list's top back up.
  await filters.click();
  await page
    .getByRole('dialog', { name: 'Filters' })
    .getByRole('button', { name: /^Party/ })
    .click();
  await page
    .getByRole('dialog', { name: 'Filters' })
    .getByRole('button', { name: /^Show / })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Our Collection' })).toBeInViewport();
  await page.getByRole('button', { name: 'Party ✕' }).click();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Filters 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Filters 2' }).click();
  await page.getByRole('dialog', { name: 'Filters' }).getByRole('button', { name: 'Clear all' }).click();
  await page
    .getByRole('dialog', { name: 'Filters' })
    .getByRole('button', { name: `Show ${GAMES.length} games` })
    .click();
  await expect(page).toHaveURL(/\/$/);
});
