import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y-x'
import tseslint from 'typescript-eslint'
import playwright from 'eslint-plugin-playwright'
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage', '.stryker-tmp', 'reports', 'test-results', 'playwright-report', 'blob-report']),
  {
    files: ['**/*.{ts,tsx}'],
    // The Playwright suite runs in Node and has its own block below; React's
    // rules would read a fixture's `use()` as the React hook.
    ignores: ['e2e/**', 'playwright.config.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      '@eslint-community/eslint-comments': eslintComments,
    },
    rules: {
      // Enforce CLAUDE.md's "never suppress lint or type errors": ban every
      // inline eslint control comment (eslint-disable, disable-next-line,
      // eslint-enable, …). The sanctioned escape hatch stays the file-scoped
      // overrides in this config below — those are configuration, not comments,
      // so they are unaffected. @ts-ignore/@ts-nocheck are already blocked by
      // @typescript-eslint/ban-ts-comment.
      '@eslint-community/eslint-comments/no-use': 'error',
    },
  },
  {
    // Playwright end-to-end tests (`npm run test:e2e`).
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      playwright.configs['flat/recommended'],
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    plugins: {
      '@eslint-community/eslint-comments': eslintComments,
    },
    rules: {
      '@eslint-community/eslint-comments/no-use': 'error',
      // Find elements the way a user does (role, label, text), never by CSS
      // or XPath, and wait on UI state rather than the clock.
      'playwright/no-raw-locators': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-wait-for-selector': 'error',
      'playwright/no-force-option': 'error',
      'playwright/prefer-web-first-assertions': 'error',
    },
  },
  {
    // Plain Node CI helpers (.github/scripts). Untyped JS.
    files: ['.github/scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    // backdrop <div> uses onClick for mouse dismiss; Escape + close button cover keyboard
    files: ['src/components/Backdrop.tsx'],
    rules: {
      'jsx-a11y-x/no-static-element-interactions': 'off',
      'jsx-a11y-x/click-events-have-key-events': 'off',
    },
  },
  {
    // refs written during render so sync/tick reads never see a stale frame
    files: ['src/context/useFilterUrlSync.ts', 'src/components/RandomPicker.tsx'],
    rules: {
      'react-hooks/refs': 'off',
    },
  },
])
