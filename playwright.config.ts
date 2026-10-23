import { defineConfig, devices } from '@playwright/test';

// Not vite preview's default 4173, so a `npm run preview` left running on a
// stale build is never mistaken for the server these tests started.
const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = !!process.env.CI;
// Visual regression (e2e/visual.ts): the core pages everywhere, the full set
// in desktop Chromium, the phone-only states on phones.
const VISUAL = /visual(-full|-phone)?\.spec\.ts$/;
const CORE = /visual\.spec\.ts$/;
const DESKTOP = { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' } as const;
// For machines whose preinstalled Chromium doesn't match this Playwright
// release; CI installs the matching browsers instead.
const chromiumLaunch = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
  : {};

/**
 * End-to-end tests: the production build, served by `vite preview`, driven
 * in Chromium, with the visual suite in Chromium, Firefox and WebKit. Every
 * `/api/*` call is stubbed with fixtures (e2e/fixtures.ts), which abort any
 * request off the preview origin, and a spec that needs the dictionary API
 * stubs it itself, so a run needs no network and no secrets.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  // One retry in CI, so a failure that doesn't repeat shows up as flaky
  // rather than red-then-green on a rerun; failOnFlakyTests still fails the
  // run when that retry passes, so it never hides a flake.
  retries: CI ? 1 : 0,
  failOnFlakyTests: CI,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    // The trace of the attempt that failed, not of a retry that may pass.
    trace: 'retain-on-first-failure',
    // The service worker answers requests itself, out of page.route's
    // reach, so it would slip past the stubs. Only e2e/offline.spec.ts,
    // which tests it, lets it run.
    serviceWorkers: 'block',
  },
  // Visual regression's screenshots (e2e/visual.spec.ts), compared with
  // baselines: off but this one test's own small diffs, so a style that
  // moves an element shows.
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  projects: [
    { name: 'chromium', testIgnore: VISUAL, use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunch } },
    // The visual suite, in all three engines and on phones (the free
    // stand-in for a cross-browser screenshot service). Reduced motion holds
    // the hero's row of covers still.
    {
      name: 'visual-chromium',
      testMatch: /visual(-full)?\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], ...DESKTOP, launchOptions: chromiumLaunch },
    },
    { name: 'visual-firefox', testMatch: CORE, use: { ...devices['Desktop Firefox'], ...DESKTOP } },
    { name: 'visual-webkit', testMatch: CORE, use: { ...devices['Desktop Safari'], ...DESKTOP } },
    {
      name: 'visual-phone-chromium',
      testMatch: /visual(-phone)?\.spec\.ts$/,
      use: { ...devices['Pixel 7'], reducedMotion: 'reduce', launchOptions: chromiumLaunch },
    },
    {
      name: 'visual-phone-webkit',
      testMatch: /visual(-phone)?\.spec\.ts$/,
      use: { ...devices['iPhone 14'], reducedMotion: 'reduce' },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    // Always this checkout's own build: reusing a server already on the port
    // could test another worktree's.
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
