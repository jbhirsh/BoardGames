import { defineConfig, devices } from '@playwright/test';

// Not vite preview's default 4173, so a `npm run preview` left running on a
// stale build is never mistaken for the server these tests started.
const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = !!process.env.CI;
// Visual regression (e2e/visual.ts): every state on the desktop, the core
// pages and the phone-only states on the phone.
const VISUAL = /visual(-full|-desktop|-phone)?\.spec\.ts$/;
// The phone project's own spec, e2e/phone.spec.ts (not visual-phone.spec.ts).
const PHONE = /(^|[\\/])phone\.spec\.ts$/;
const DESKTOP = { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' } as const;
// The newest iPhone Pro's window: 402 by 681 under Safari's bars, 3x,
// touch. The 18 Pro's screen is the same size; switch when Playwright ships
// its descriptor.
const IPHONE = devices['iPhone 17 Pro'];

/**
 * End-to-end tests: the production build, served by `vite preview`, driven
 * in WebKit, Safari's engine, on a desktop and on an iPhone, as the site's
 * people use Safari; the visual suite likewise. Linux's WebKit is Safari's
 * engine but not Apple's build: fonts (no SF Pro: `-apple-system` falls back)
 * and safe-area insets still differ from a real iPhone. Locally, WebKit
 * needs `npx playwright install --with-deps webkit` (Linux's system
 * libraries for it too). Every `/api/*` call is stubbed with fixtures
 * (e2e/fixtures.ts), which abort any request off the preview origin, and a
 * spec that needs the dictionary API stubs it itself, so a run needs no
 * network and no secrets.
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
  // In CI, JUnit too, for the job summary (jbhirsh/ci's job-summary, in
  // e2e.yml): each test named with its project, since the visual suite runs
  // the same tests in several, and with its retries, so a test that passed
  // only on its retry shows as flaky in the report (each failed try a
  // <flakyFailure>) rather than as a plain pass.
  reporter: CI
    ? [
        ['github'],
        ['html', { open: 'never' }],
        [
          'junit',
          {
            outputFile: 'test-results/junit.xml',
            includeProjectInTestName: true,
            includeRetries: true,
          },
        ],
      ]
    : [['list'], ['html', { open: 'never' }]],
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
  // The site is designed phone first, so a phone is a project of its own:
  // e2e/phone.spec.ts runs in the iPhone's window, every other spec on a
  // desktop (Safari's 1280 by 720, 2x). A spec there may still set a
  // phone's width for a check beside its desktop one.
  projects: [
    {
      name: 'desktop',
      testIgnore: [VISUAL, PHONE],
      use: { ...devices['Desktop Safari'] },
    },
    { name: 'phone', testMatch: PHONE, use: { ...IPHONE } },
    // The visual suite: every state in both themes on the desktop, the core
    // pages and what only a phone shows on the iPhone. Reduced motion holds
    // the hero's row of covers still.
    {
      name: 'visual-webkit',
      testMatch: /visual(-full|-desktop)?\.spec\.ts$/,
      use: { ...devices['Desktop Safari'], ...DESKTOP },
    },
    // The README's screenshots (e2e/readme.shots.ts), only when asked for.
    ...(process.env.README_SHOTS
      ? [{ name: 'readme', testMatch: /readme\.shots\.ts$/, use: { ...devices['Desktop Safari'] } }]
      : []),
    {
      name: 'visual-phone-webkit',
      testMatch: /visual(-phone)?\.spec\.ts$/,
      use: { ...IPHONE, reducedMotion: 'reduce' },
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
