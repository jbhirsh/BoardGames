import { defineConfig, devices } from '@playwright/test';

// Not vite preview's default 4173, so a `npm run preview` left running on a
// stale build is never mistaken for the server these tests started.
const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = !!process.env.CI;

/**
 * End-to-end tests: the production build, served by `vite preview`, driven
 * in Chromium. Every `/api/*` call and the dictionary API are stubbed with
 * fixtures (e2e/fixtures.ts), so a run needs no network and no secrets.
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
  reporter: CI
    ? [['github'], ['html', { open: 'never' }]]
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
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // For machines whose preinstalled Chromium doesn't match this
        // Playwright release; CI installs the matching browser instead.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
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
