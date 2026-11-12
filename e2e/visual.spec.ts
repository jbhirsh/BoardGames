import { test } from './fixtures';
import { CORE, prepare, shoot } from './visual';

// The core pages in the light theme, on a desktop and on the iPhone (see
// visual.ts).
for (const scenario of CORE) {
  test(scenario.name, async ({ page }) => {
    await prepare(page, 'light');
    await scenario.open(page);
    await shoot(page, `${scenario.name}-light`);
  });
}
