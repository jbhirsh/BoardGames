/**
 * Architecture rules (dependency-cruiser). CLAUDE.md states the layering as
 * prose — "keep src/utils free of React and side effects", "src/data is the
 * static data layer" — and the AI review re-checks it per PR, but nothing
 * failed a build on a violation. These rules make the layering computational:
 *
 *   data  → data                      (leaf: types + compiled-in constants)
 *   utils → utils, data               (pure helpers; no React, no context)
 *   context ↛ components              (state layer under the UI, not beside it)
 *   api ⇹ src                         (serverless bundle and SPA stay separate)
 *
 * CommonJS (.cjs) because the package is "type": "module" and
 * dependency-cruiser loads its config via require().
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make modules impossible to reason about or test in isolation.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'utils-pure',
      severity: 'error',
      comment: 'src/utils are pure helpers: they may reach only other utils and the static data layer (CLAUDE.md: "keep these free of React and side effects").',
      from: { path: '^src/utils' },
      to: { path: '^src/', pathNot: '^src/(utils|data)/' },
    },
    {
      name: 'utils-no-react',
      severity: 'error',
      comment: 'src/utils must stay framework-free so they remain directly unit-testable.',
      from: { path: '^src/utils' },
      to: { path: '^node_modules/(react|react-dom|react-router)' },
    },
    {
      name: 'data-is-leaf',
      severity: 'error',
      comment: 'src/data is the static source of truth; it may not depend on app code.',
      from: { path: '^src/data' },
      to: { path: '^src/', pathNot: '^src/data/' },
    },
    {
      name: 'data-no-react',
      severity: 'error',
      comment: 'src/data holds compiled-in constants and types only.',
      from: { path: '^src/data' },
      to: { path: '^node_modules/(react|react-dom|react-router)' },
    },
    {
      name: 'context-below-components',
      severity: 'error',
      comment: 'The filter state layer sits under the UI; components consume context, never the reverse.',
      from: { path: '^src/context' },
      to: { path: '^src/components' },
    },
    {
      name: 'api-isolated-from-src',
      severity: 'error',
      comment: 'Serverless functions are bundled separately by Vercel; importing from src/ would drag DOM-flavored code into the Node runtime.',
      from: { path: '^api/' },
      to: { path: '^src/' },
    },
    {
      name: 'src-no-api-imports',
      severity: 'error',
      comment: 'The SPA talks to the API over HTTP, never by importing server code into the browser bundle. src/__tests__ is exempt: api handlers are deliberately written against small interfaces so those tests can drive them with fakes.',
      from: { path: '^src/', pathNot: '^src/__tests__/' },
      to: { path: '^api/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
