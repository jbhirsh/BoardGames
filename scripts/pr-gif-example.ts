// An example scenario for record-pr-gif.ts: the hero's cover carousel,
// dragged right and let go, then a search typed in under it.
//
//   npm run pr-gif -- scripts/pr-gif-example.ts --side-by-side
//
// Copy it for a PR's own recording; it needn't be committed.
import { click, drag, glide, type Scenario } from './pr-gif.ts';

export default {
  path: '/',
  // From the carousel's box, the window's width, with room above and below for the pointer.
  clip: async (page) => {
    const box = (await page.getByRole('list', { name: 'Collection covers' }).boundingBox())!;
    return { x: 0, y: Math.max(0, box.y - 45), width: page.viewportSize()!.width, height: box.height + 165 };
  },
  ready: async (page) => {
    await page.getByRole('list', { name: 'Collection covers' }).waitFor();
  },
  play: async (page) => {
    const row = (await page.getByRole('list', { name: 'Collection covers' }).boundingBox())!;
    const width = page.viewportSize()!.width;
    const y = row.y + row.height / 2;
    // Rest under the row, in shot but off the covers, which would hold it.
    const rest = { x: width / 2, y: y + row.height / 2 + 30 };
    await glide(page, rest);
    await page.waitForTimeout(1200);
    await drag(page, { x: width * 0.25, y }, { x: width * 0.75, y });
    await glide(page, rest);
    await page.waitForTimeout(2500);
    // Into the search box, typed in (the label building up), and Tabbed out of.
    await click(page, page.getByPlaceholder('Search games...'));
    await page.keyboard.type('cat', { delay: 350 });
    await page.waitForTimeout(900);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1500);
  },
} satisfies Scenario;
