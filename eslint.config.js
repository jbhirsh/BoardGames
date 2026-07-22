import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage', '.stryker-tmp', 'reports']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
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
    // backdrop <div> uses onClick for mouse dismiss; Escape + close button cover keyboard
    files: ['src/components/Backdrop.tsx'],
    rules: {
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
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
