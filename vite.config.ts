/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
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
    coverage: {
      // vitest's defaults plus Cobertura, which ci.yml uploads to GitHub for
      // the code coverage rule on main.
      reporter: ['text', 'html', 'clover', 'json', 'cobertura'],
      thresholds: {
        perFile: true,
        lines: 80,
      },
    },
  },
})
