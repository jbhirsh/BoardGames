import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import jsdoc from 'eslint-plugin-jsdoc';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import { getDefaultSelectors } from 'eslint-plugin-better-tailwindcss/defaults';
import { defineConfig, globalIgnores } from 'eslint/config';

// JSDoc is checked where it's written, never demanded where it isn't: a tag
// must name a real parameter, say something, and parse, but no function
// needs a comment, and TypeScript's types stay in the signature (no-types).
const JSDOC_OPTIONAL = {
  'jsdoc/require-jsdoc': 'off',
  'jsdoc/require-param': 'off',
  'jsdoc/require-param-description': 'off',
  'jsdoc/require-property': 'off',
  'jsdoc/require-property-description': 'off',
  'jsdoc/require-returns': 'off',
  'jsdoc/require-returns-description': 'off',
  'jsdoc/require-yields': 'off',
  'jsdoc/require-next-type': 'off',
  'jsdoc/require-throws-type': 'off',
  'jsdoc/require-yields-type': 'off',
  // Blank lines between tags are layout, not accuracy.
  'jsdoc/tag-lines': 'off',
};

// Class names that style nothing: tests, e2e specs and scripts find
// elements by them, and a few parent variants key on them
// ([&_.rules-box-art]:…). Every style is a Tailwind class, so a name
// Tailwind doesn't know is one of these or a typo.
const HOOK_CLASSES = `
  active admin-queue atag atags awards awards-list back-link card-corner-img
  card-credit card-desc card-foot card-foot-end card-foot-start card-head
  card-kw card-name card-open clip-wrap cmeta col-actions col-diff col-hide
  col-kw col-name col-name-wrap col-players col-players-h col-short col-tags
  col-vote coming-soon dd-opt dd-opt-ct detail-section diff-none fade-end
  fade-start filterbar game-card game-row games-grid games-list group-hd
  hero-reel-cover hero-reel-list hero-reel-track hero-reel-view kind-chip
  kw-pill line line-art line-art--none line-detail line-meta line-toggle lines
  list-group-row lit mobile-short no-art notice notice-text open pdf-hit
  pdf-hit--current pdf-page pdf-reader pdf-search pdf-search-results
  pdf-search-results--idle phone-action pick-backdrop pick-btn pick-card
  row-art row-awards row-badges row-chevron row-credit row-dur row-expand
  row-expand-content row-expand-foot row-expand-inner row-subgames row-toggle
  row-yt rules-book rules-books rules-box-art rules-btn rules-btn--primary
  rules-chat-bubble rules-chat-panel rules-chat-panel-fresh rules-chat-scope
  rules-chat-toggle rules-download rules-game-desc rules-game-name
  rules-header rules-more rules-page rules-pdf-links rules-save
  rules-save-status rules-short rules-title-info rules-title-row rules-wide
  sc-field sc-label sc-row sc-science-section sc-unit sc-win sec-hd show
  skeleton-text sortable sticky-header sub-desc sub-link sub-links sub-name
  sub-pill-full sub-pill-short sub-tag sub-tag-wrap sub-yt table-wrap vote-btn
  vote-btn--compact vote-btn--on vote-label wish-card wish-grid wish-group
  wishlist
`
  .trim()
  .split(/\s+/);

export default defineConfig([
  // src/gql is written by `npm run codegen`.
  globalIgnores([
    'dist',
    'coverage',
    'src/gql',
    '.stryker-tmp',
    'reports',
    'test-results',
    'playwright-report',
    'blob-report',
  ]),
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
    extends: [js.configs.recommended, tseslint.configs.recommended, playwright.configs['flat/recommended']],
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
      // The visual specs assert through shoot() (e2e/visual.ts).
      'playwright/expect-expect': ['warn', { assertFunctionNames: ['shoot'] }],
    },
  },
  {
    // Plain Node CI helpers (.github/scripts) and the data scripts
    // (scripts/). Untyped JS.
    files: ['.github/scripts/**/*.mjs', 'scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    // Tailwind's classes (src/index.css is its entry and theme): no
    // conflicting (`text-text text-blue`), duplicate, unknown or deprecated
    // classes, and no literal colour in an arbitrary value (colours are
    // tokens). One class order, variant order, `!` position and variable
    // syntax, and the canonical or shorthand spelling (`w-4 h-4` → `size-4`,
    // `[16px]` → its scale step), all fixed by `npm run lint:fix`; collapse:
    // false keeps two tokens that happen to share a value as written. Besides
    // className, the strings in a variable named …Class or …Classes are
    // checked: the class modules beside the components.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/__tests__/**'],
    plugins: { 'better-tailwindcss': betterTailwindcss },
    settings: {
      'better-tailwindcss': {
        entryPoint: 'src/index.css',
        selectors: [
          ...getDefaultSelectors(),
          { kind: 'variable', name: '^\\w*(Class|Classes)$', match: [{ type: 'strings' }, { type: 'objectValues' }] },
        ],
      },
    },
    rules: {
      'better-tailwindcss/no-conflicting-classes': 'error',
      'better-tailwindcss/no-duplicate-classes': 'error',
      'better-tailwindcss/no-unknown-classes': [
        'error',
        // pdf.js's text layer is styled in index.css, as pdf.js names it.
        { ignore: ['^textLayer$', ...HOOK_CLASSES.map((name) => `^${name}$`)] },
      ],
      'better-tailwindcss/no-deprecated-classes': 'error',
      'better-tailwindcss/no-restricted-classes': [
        'error',
        {
          restrict: [
            {
              pattern: '\\[[^\\]]*(#[0-9a-fA-F]{3,8}\\b|\\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\\()',
              message:
                'A literal colour in an arbitrary value: colours are tokens (src/index.css), tinted by modifier (bg-gold/12).',
            },
          ],
        },
      ],
      'better-tailwindcss/no-unnecessary-whitespace': 'error',
      'better-tailwindcss/enforce-consistent-class-order': 'error',
      'better-tailwindcss/enforce-consistent-variant-order': 'error',
      'better-tailwindcss/enforce-consistent-important-position': 'error',
      'better-tailwindcss/enforce-consistent-variable-syntax': 'error',
      'better-tailwindcss/enforce-canonical-classes': ['error', { collapse: false }],
      'better-tailwindcss/enforce-shorthand-classes': 'error',
    },
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
  {
    files: ['**/*.{ts,tsx}'],
    extends: [jsdoc.configs['flat/recommended-typescript-error']],
    rules: JSDOC_OPTIONAL,
  },
  {
    // Plain JS documents its types in JSDoc, so those are checked too.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [jsdoc.configs['flat/recommended-error']],
    rules: JSDOC_OPTIONAL,
  },
  // Last, so it switches off every rule above that only argues with
  // Prettier's layout (npm run format); Prettier owns formatting.
  eslintConfigPrettier,
]);
