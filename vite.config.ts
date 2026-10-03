import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: true,
  },
  plugins: [
    react(),
    sentryVitePlugin({
      org: "solo-23",
      project: "game_room",
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // e2e/ holds the Playwright suite (`npm run test:e2e`), which drives a
    // real browser; its *.spec.ts files are not Vitest tests.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      // vitest's defaults plus Cobertura, which ci.yml uploads to GitHub for
      // the code coverage rule on main.
      reporter: ['text', 'html', 'clover', 'json', 'cobertura'],
      exclude: ['e2e/**', 'playwright.config.ts'],
      thresholds: {
        perFile: true,
        lines: 80,
      },
    },
  },
})
