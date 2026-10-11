import type { Locator } from '@playwright/test';
import { test, expect } from './fixtures';

test('the 7 Wonders calculator totals a player and ranks the table', async ({ page }) => {
  await page.goto('/score/7-wonders');
  await expect(page.getByRole('heading', { level: 1, name: 'Score Calculator', exact: true })).toBeVisible();

  const field = (name: string | RegExp) => page.getByRole('spinbutton', { name });
  await field(/Military/).fill('5');
  await field(/Treasury/).fill('7'); // 7 coins: 2 VP
  await field('Wonder').fill('3');
  await field(/Civilian/).fill('10');
  await field(/Commercial/).fill('4');
  await field(/Guilds/).fill('6');
  // Science: 2² + 1² + 1² + 7 for the one full set = 13 VP.
  await field('tablets').fill('2');
  await field('compasses').fill('1');
  await field('gears').fill('1');

  await expect(page.getByText('= 2 VP', { exact: true })).toBeVisible();
  await expect(page.getByText('= 13 VP', { exact: true })).toBeVisible();
  // 5 + 2 + 3 + 10 + 4 + 6 + 13
  await expect(page.getByText('43 VP', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Results', exact: true }).click();
  const sheet = page.getByRole('table', { name: 'Scores by category' });
  const row = (name: string) => sheet.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
  await expect(row('Science').getByRole('cell')).toHaveText(['13', '0']);
  await expect(row('Total').getByRole('cell')).toHaveText(['43', '0']);
  await expect(row('Place').getByRole('cell')).toHaveText(['1st', '2nd']);
});

test('on a phone the score sheet scrolls sideways with the categories pinned', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/score/7-wonders');
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Add player' }).click();
  await page.getByRole('button', { name: 'Results', exact: true }).click();

  const sheet = page.getByRole('table', { name: 'Scores by category' });
  const military = sheet.getByRole('rowheader', { name: 'Military' });
  const before = (await military.boundingBox())!;
  // Seven players don't fit across a phone: the sheet scrolls, not the page.
  const scrolled = await sheet.evaluate((table) => {
    const wrap = table.parentElement!;
    wrap.scrollLeft = wrap.scrollWidth;
    return wrap.scrollLeft;
  });
  expect(scrolled).toBeGreaterThan(0);
  await expect(sheet.getByRole('columnheader', { name: 'Player 7' })).toBeInViewport();
  const after = (await military.boundingBox())!;
  expect(after.x).toBe(before.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('Next passes the phone round the table and ends on the results', async ({ page }) => {
  await page.goto('/score/7-wonders');
  await page.getByRole('spinbutton', { name: /Civilian/ }).fill('6');
  await page.getByRole('button', { name: 'Next: Player 2' }).click();
  await expect(page.getByLabel('Player Name')).toBeFocused();
  await expect(page.getByLabel('Player Name')).toHaveValue('Player 2');
  await page.getByRole('spinbutton', { name: /Civilian/ }).fill('9');
  await page.getByRole('button', { name: 'See results' }).click();
  const total = page.getByRole('table', { name: 'Scores by category' }).getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Total', exact: true }) });
  await expect(total.getByRole('cell')).toHaveText(['6', '9']);
});

test('a game with no score calculator shows the not-found page', async ({ page }) => {
  await page.goto('/score/catan');
  await expect(page.getByRole('heading', { level: 1, name: 'No score calculator', exact: true })).toBeVisible();
  await expect(page.getByText("There's no score calculator for that game.")).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Score Calculator', exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'Browse the collection' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Our Collection' })).toBeVisible();
});

test('a negative military score can be typed and the game survives a reload', async ({ page }) => {
  await page.goto('/score/7-wonders');
  const field = (name: string | RegExp) => page.getByRole('spinbutton', { name });

  await field(/Military/).click();
  await page.keyboard.type('-2');
  await field(/Civilian/).click();
  await page.keyboard.type('7');
  await expect(field(/Military/)).toHaveValue('-2');
  await expect(field(/Civilian/)).toHaveValue('7');
  await expect(page.getByText('5 VP', { exact: true })).toBeVisible();

  await page.reload();
  await expect(field(/Military/)).toHaveValue('-2');
  await expect(page.getByText('5 VP', { exact: true })).toBeVisible();
});

// The box keeps its unit's room on both sides, so the score is centred in
// the whole box, with the unit in the right-hand room.
test('a score sits dead centre in its box', async ({ page }) => {
  await page.goto('/score/7-wonders');
  // 7, 1 and 0 have no lopsided curve past the cap line or the baseline.
  const fields: [Locator, string][] = [
    [page.getByRole('spinbutton', { name: 'Treasury' }), '17'],
    [page.getByRole('spinbutton', { name: 'Wonder' }), '107'],
    [page.getByRole('spinbutton', { name: 'gears' }), '107'],
  ];
  for (const [field, value] of fields) {
    await field.fill(value);
    await page.getByRole('heading', { level: 1, name: 'Score Calculator', exact: true }).click();
    const shot = (await field.screenshot()).toString('base64');
    // Where the unit's room starts: ink right of it is the unit's.
    const unitRoom = await field.evaluate((el) => {
      const s = getComputedStyle(el);
      return parseFloat(s.borderRightWidth) + parseFloat(s.paddingRight);
    });
    // The ink's bounding box, left of the unit's room and inside the 2px
    // border, against the middle of the box.
    const off = await page.evaluate(async ({ png, unitRoom }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, img.width, img.height);
      const bg = data[(4 * img.width + 4) * 4];
      let top = Infinity, bottom = -1, left = Infinity, right = -1;
      for (let y = 4; y < img.height - 4; y++) {
        for (let x = 4; x < img.width - unitRoom; x++) {
          if (Math.abs(data[(y * img.width + x) * 4] - bg) > 80) {
            top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
            left = Math.min(left, x); right = Math.max(right, x + 1);
          }
        }
      }
      return { x: (left + right - img.width) / 2, y: (top + bottom - img.height) / 2 };
    }, { png: shot, unitRoom });
    expect(Math.abs(off.x), `${value}: across`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(off.y), `${value}: up and down`).toBeLessThanOrEqual(0.5);
  }
});

/**
 * Whether a sits on b's line (its middle inside b's line box) or wraps
 * under it, starting where b does. Smaller text shares b's baseline, so how
 * far the two middles sit apart depends on the font; CI's differs from ours.
 */
function onOrUnder(a: { x: number; y: number; height: number }, b: { x: number; y: number; height: number }) {
  const middle = a.y + a.height / 2;
  const level = middle >= b.y && middle <= b.y + b.height;
  return level ? a.x > b.x : a.y >= b.y + b.height - 1 && Math.abs(a.x - b.x) <= 1;
}

/**
 * The boxes of several elements read in one go. The page scrolls smoothly
 * after a fill, so boxes read one call apart can come from different scroll
 * positions.
 */
async function boxesOf(...locators: Locator[]) {
  const handles = await Promise.all(locators.map((l) => l.elementHandle()));
  return locators[0].page().evaluate((els) => els.map((el) => {
    const { x, y, width, height } = el!.getBoundingClientRect();
    return { x, y, width, height };
  }), handles);
}

// A phone as wide as most, and as narrow as any still in use.
for (const [width, height] of [[390, 844], [320, 568]]) {
  test(`on a ${width}px phone each box names its unit and a converted field shows its points on its label line`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/score/7-wonders');
    const field = (name: string) => page.getByRole('spinbutton', { name, exact: true });

    await expect(field('Wonder')).toHaveAccessibleDescription('VP');
    await expect(field('Treasury')).toHaveAccessibleDescription('coins = 0 VP');
    await expect(field('tablets')).toHaveAccessibleDescription('symbols = 0 VP');
    await expect(field('Treasury')).toHaveAttribute('inputmode', 'numeric');
    // Where the rows under each converted field sit on the page.
    const rows = async () => Promise.all(['Wonder', 'tablets'].map((name) => field(name).evaluate((el) => el.getBoundingClientRect().top + window.scrollY)));
    const before = await rows();

    await field('Military').fill('-1');
    await field('Treasury').fill('10'); // 3 VP
    await field('Wonder').fill('7');
    await field('Civilian (Blue)').fill('14');
    await field('tablets').fill('3');
    await field('compasses').fill('2');
    await field('gears').fill('1'); // 9 + 4 + 1 + 7 = 21 VP

    await expect(page.getByText('= 3 VP', { exact: true })).toBeVisible();
    await expect(page.getByText('= 21 VP', { exact: true })).toBeVisible();
    await expect(field('Treasury')).toHaveAccessibleDescription('coins = 3 VP');
    await expect(field('gears')).toHaveAccessibleDescription('symbols = 21 VP');
    // -1 + 3 + 7 + 14 + 21
    await expect(page.getByText('44 VP', { exact: true })).toBeVisible();

    // Treasury's points sit beside its label, or under it where the row is
    // too narrow, and left of its box.
    const [treasury, coinsVP, coinsBox] = await boxesOf(
      page.getByText('Treasury', { exact: true }), page.getByText('= 3 VP', { exact: true }), field('Treasury'));
    expect(onOrUnder(coinsVP, treasury), 'Treasury\'s points on its label line').toBe(true);
    expect(coinsVP.x + coinsVP.width).toBeLessThanOrEqual(coinsBox.x);
    // Science says its unit once, with its points, on its label line, above the boxes.
    const [science, unit, scienceVP, tablets] = await boxesOf(
      page.getByText('Science (Green)', { exact: true }), page.getByText('symbols', { exact: true }),
      page.getByText('= 21 VP', { exact: true }), field('tablets'));
    expect(onOrUnder(unit, science), 'the science unit on its label line').toBe(true);
    expect(Math.abs(scienceVP.y - unit.y), 'the science points beside the unit').toBeLessThanOrEqual(1);
    expect(scienceVP.x).toBeGreaterThan(unit.x + unit.width);
    expect(scienceVP.y + scienceVP.height).toBeLessThanOrEqual(tablets.y);
    // Nothing moved as the points grew from 0.
    expect(await rows()).toEqual(before);
    // The page doesn't pan.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

// The longest score each box takes in a real game.
const LONG_SCORES: [name: string, value: string][] = [
  ['Military', '-12'],
  ['Treasury', '99'],
  ['Wonder', '107'],
  ['Civilian (Blue)', '107'],
  ['Commercial (Yellow)', '107'],
  ['Guilds (Purple)', '107'],
];
// Their icons say which symbol; the unit is on the label line.
const SCIENCE_SCORES: [name: string, value: string][] = ['tablets', 'compasses', 'gears'].map((name) => [name, '12']);

/**
 * Where a box draws its score (its content area), how wide the score is,
 * and where the box's own unit sits, if it shows one.
 */
async function scoreAndUnit(field: Locator) {
  return field.evaluate((el: HTMLInputElement) => {
    const s = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = s.font;
    const unit = document.getElementById(`${el.id}-unit`)?.firstElementChild?.getBoundingClientRect();
    return {
      box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      content: {
        left: box.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft),
        right: box.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight),
      },
      unit: unit && { left: unit.left, top: unit.top, right: unit.right, bottom: unit.bottom },
      score: ctx.measureText(el.value).width,
    };
  });
}

for (const width of [1280, 390, 375, 320]) {
  test(`at ${width}px each box takes a long score whole and centred, clear of its unit`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/score/7-wonders');
    const fill = async (name: string, value: string) => {
      const field = page.getByRole('spinbutton', { name, exact: true });
      await field.fill(value);
      const measured = await scoreAndUnit(field);
      const { box, content, score } = measured;
      expect(score, `${name}: the score fits`).toBeLessThanOrEqual(content.right - content.left);
      expect(Math.abs((content.left + content.right) / 2 - (box.left + box.right) / 2), `${name}: the score is centred`).toBeLessThanOrEqual(1);
      return measured;
    };
    for (const [name, value] of LONG_SCORES) {
      const { box, content, unit } = await fill(name, value);
      expect(unit, `${name}: a unit in the box`).toBeDefined();
      expect(unit!.left, `${name}: unit right of the score`).toBeGreaterThanOrEqual(content.right);
      expect(unit!.right, `${name}: unit inside the box`).toBeLessThanOrEqual(box.right);
      expect(unit!.top, `${name}: unit inside the box`).toBeGreaterThanOrEqual(box.top);
      expect(unit!.bottom, `${name}: unit inside the box`).toBeLessThanOrEqual(box.bottom);
    }
    for (const [name, value] of SCIENCE_SCORES) {
      expect((await fill(name, value)).unit, `${name}: no unit in the box`).toBeUndefined();
    }
    // The page doesn't pan.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
