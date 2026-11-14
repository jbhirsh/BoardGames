import { test } from './fixtures';
import { GRID, prepare, shoot } from './visual';

// The collection's grid on a desktop, in the light theme (see visual.ts);
// visual-phone.spec.ts shoots a phone's.
for (const scenario of GRID) {
  test(scenario.name, async ({ page }) => {
    await prepare(page, 'light');
    await scenario.open(page);
    await shoot(page, `${scenario.name}-light`);
  });
}
