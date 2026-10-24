import { test } from './fixtures';
import { WIDE, prepare, shoot } from './visual';

// What only a desktop lays out differently, in the light theme, in every
// engine (see visual.ts); a phone shows these as visual.spec.ts's pages.
for (const scenario of WIDE) {
  test(scenario.name, async ({ page }) => {
    await prepare(page, 'light');
    await scenario.open(page);
    await shoot(page, `${scenario.name}-light`);
  });
}
