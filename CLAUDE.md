# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

**The Game Room** — a single-page app for browsing a personal board game
collection. Filter and sort 26 games, get a random pick, read bundled rule
PDFs, ask an AI rules assistant, tally a 7 Wonders score, check whether a word
is playable in Bananagrams, and vote on a wishlist. React 19 + TypeScript SPA
built with Vite, deployed on Vercel with a small serverless API.

## Commands

```bash
npm install          # install dependencies
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # tsc -b (type-check, project refs) then vite build -> dist/
npm run lint         # eslint . (flat config; includes jsx-a11y static checks)
npm run preview      # serve the production build locally

# Tests — there is no `npm test` script; call vitest directly:
npx vitest                              # watch mode
npx vitest run                          # single run (CI uses this)
npx vitest run --coverage               # with coverage (thresholds enforced)
npx vitest run src/__tests__/a11y.test.tsx   # accessibility suite only
npx tsc -b                              # type-check without emitting
```

Node 24 is used in CI. Run `npm run lint`, `npx tsc -b`, and `npx vitest run`
before committing — CI runs all three plus a production build.

## Architecture

### Client (`src/`)
- **`main.tsx`** — entry point. Imports `./instrument` first (Sentry), then
  mounts a `createBrowserRouter` with four routes:
  - `/` — `HomePage` (hero, filter bar, collection, wishlist)
  - `/rules/:slug` — bundled rule PDF viewer + AI rules assistant
  - `/score/:slug` — score calculator (currently 7 Wonders)
  - `/word-checker` — dictionary lookup for word games
- **`App.tsx`** — layout shell: wraps the router `Outlet` in `FilterProvider`
  and mounts Vercel `Analytics`.
- **`data/`** — the static data layer. `games.ts` is the source of truth for
  the collection; `wishlist.ts`, `keywords.ts`, `initialFilterState.ts`, and
  `types.ts` support it. No database on the read path — the collection is a
  compiled-in constant.
- **`context/`** — filtering state. `FilterContext` holds a `useReducer` store
  (`filterReducer.ts`); `useFilter.ts` is the consumer hook; `useFilterUrlSync.ts`
  keeps filter state mirrored to the URL query string so views are shareable.
- **`components/`** — presentational + interactive UI (grid/list views, filter
  bar, random picker, rules page, rules chat, word checker, score calculator,
  wishlist + voting). `Icons.tsx` holds inline SVGs.
- **`utils/`** — pure helpers (`filterGames.ts`, `pickRandom.ts`, `filterUrl.ts`,
  `urls.ts`). Keep these free of React and side effects.
- **`instrument.ts`** — Sentry browser SDK init (`@sentry/react`), including
  browser tracing and session replay.

### Serverless API (`api/`) — Vercel Functions (`@vercel/node`)
- **`chat.ts`** — the AI rules assistant. Reads `rules-text/<slug>.txt`, sends
  it plus the recent chat history to Google Gemini (`@google/genai`,
  `gemini-2.5-flash`) and streams the reply back as plain text. Validates slug,
  message length (<=500), and history length (<=10). Errors reported to Sentry
  (`@sentry/node`).
- **`votes.ts`** — anonymous wishlist voting backed by Upstash Redis
  (`@upstash/redis`). `handleVotes()` is written against small interfaces
  (`VotesRedis`, `VotesRequest`, `VotesResponse`) so it can be unit-tested with
  a fake Redis; the default export wires in the real client. Votes are stored as
  Redis sets keyed `wishlist:votes:<id>`, deduped by an anonymous browser id.

### Rules text pipeline (`scripts/`)
Rule PDFs live in `public/rules/*.pdf`. `scripts/extract-rules-text.mjs`
extracts text with `unpdf`, falling back to OCR (`tesseract.js`, via
`scripts/ocr-pdfs.mjs`) for image-only PDFs, and writes `rules-text/*.txt`.
`vercel.json` bundles `rules-text/**` into the `api/chat.ts` function so it can
read them at runtime.

### External services
- **Google Gemini** — AI rules answers (server-side, `GEMINI_API_KEY`).
- **Upstash Redis / Vercel KV** — wishlist vote storage.
- **Sentry** — error monitoring (browser + serverless) and source-map upload at
  build time via `@sentry/vite-plugin` (org `solo-23`, project `game_room`).
- **dictionaryapi.dev** — public dictionary API called directly from the Word
  Checker component (no key required).

## Environment variables

Copy `.env.example` to `.env.local` (gitignored) and fill in real values. No
secrets belong in tracked source.

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SENTRY_DSN` | client (`src/instrument.ts`) | Sentry browser DSN (must be `VITE_`-prefixed to reach the browser) |
| `SENTRY_DSN` | serverless (`api/chat.ts`) | Sentry Node DSN |
| `GEMINI_API_KEY` | serverless (`api/chat.ts`) | Google Gemini key (server-only) |
| `KV_REST_API_URL` | serverless (`api/votes.ts`) | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | serverless (`api/votes.ts`) | Upstash Redis REST token |
| `SENTRY_AUTH_TOKEN` | build (optional) | enables Sentry source-map upload during `vite build` |

## Conventions

- **TypeScript strict everywhere.** Three project configs under one solution:
  `tsconfig.app.json` (`src`, DOM libs), `tsconfig.api.json` (`api`, Node libs),
  `tsconfig.node.json` (`vite.config.ts`). `npm run build` runs `tsc -b` across
  all of them.
- **Never suppress lint or type errors.** No inline `// eslint-disable-*` or
  `@ts-ignore`/`@ts-expect-error`. If a rule genuinely needs relaxing, add a
  narrow, file-scoped override in `eslint.config.js` (see the existing
  `Backdrop.tsx` and `useFilterUrlSync.ts` overrides for the pattern) — and only
  with a comment explaining why.
- **Tests live in `src/__tests__/`** (Vitest + React Testing Library, jsdom).
  Coverage thresholds are enforced **per file at 80% lines** (`vite.config.ts`),
  so new reducer actions, filter utilities, and API handlers need their own
  tests. Tests must be pure logic or RTL — no real network, no real browser.
  Don't edit a test to match wrong behavior; fix the implementation.
- **Pure utilities stay pure.** Filtering/sorting/URL logic in `src/utils/` and
  `src/context/filterReducer.ts` should have no side effects and be directly
  unit-testable.
- **Validate only at boundaries.** The serverless handlers validate untrusted
  input (slug format, lengths, vote values); don't add defensive checks for
  states that can't occur inside the app.
- **Commit hygiene.** Imperative subject <=72 chars; body explains *why*. One
  logical change per commit; squash "fix typo"/"oops" churn before opening or
  updating a PR. Linear history (rebase, not merge).

## Deployment

Vercel (`vercel.json`): `framework: vite`, output `dist/`, SPA rewrites send
non-API, non-file routes to `index.html`, and `api/*` maps to the serverless
functions. CI (`.github/workflows/ci.yml`) runs lint, type-check, a11y tests,
unit tests with coverage, and a build on `ubuntu-latest` for every PR to `main`,
followed by an automated Claude review; `claude-autofix.yml` addresses
unresolved review comments. All CI runs on GitHub-hosted `ubuntu-latest`
runners.
