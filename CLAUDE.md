# CLAUDE.md

**The Game Room**: a SPA for a personal board game collection, React 19 + TypeScript + Vite on
Vercel with one GraphQL function. The shared rules every repo here follows come from
jbhirsh/ci (`claude-rules/CLAUDE.md`); setup, the required checks and one-time settings are in
`CONTRIBUTING.md`. Each module's header or JSDoc says what it does and why: read it before
changing the module.

## Commands that aren't obvious

- There is no `npm test`: `npx vitest run` (add `--coverage` for the gate CI runs). CI uses Node
  24; when yours differs, run the tests under it
  (`npx -y node@24 node_modules/vitest/vitest.mjs run`), as some web APIs differ (a jsdom `Blob`
  test passed on 22 and failed on 24).
- Type-check with `npm run typecheck`, never bare `npx tsc` (below).
- `npm run codegen` after changing a GraphQL operation or the SDL, and `npm run db:generate`
  after changing `api/_db/schema.ts`; commit what each writes (`src/gql/`, `drizzle/`).
- `npm run test:e2e` needs a Chromium matching the installed `@playwright/test`
  (`npx playwright install chromium`), or `PLAYWRIGHT_CHROMIUM_EXECUTABLE` pointing at one.

## Where names don't tell

- `api/graphql.ts` is the one Vercel Function: GraphQL Yoga over `api/_schema.graphql`, its
  resolvers in `api/_resolvers/`, each headed by its rules.
- `src/client/graphql.ts` is the browser's one way to the API; its operations are in
  `src/client/operations/*.graphql`.
- `src/data/games.ts` is the collection's source of truth, compiled in: no database on the read
  path.

## Traps that cross files

- **TypeScript 7 runs beside the TypeScript 6 API.** TS 7 (the native compiler) has no
  JavaScript API, which typescript-eslint, type-coverage and dependency-cruiser load through
  `require('typescript')`, so `@typescript/native` aliases `typescript@7` and `typescript`
  aliases `@typescript/typescript6`. Which `tsc` wins can change on any `npm install`. Drop the
  aliases once all three support TS 7.
- **`patches/` holds a `patch-package` fix** (on `postinstall`): a pdf.js range rejection
  marked handled. Delete it once upstream fixes it; a changed release fails to patch, which
  fails CI's install.
- **Owner mutations must be JSON.** CSRF protection is Better Auth's session cookie's
  SameSite=Lax, then the JSON media type (`api/_lib/json.ts`), which a cross-site form can't
  send without a preflight: every POST to `/api/graphql` must be JSON (checked on the headers as
  they arrived, in `api/graphql.ts`), Yoga's CSRF plugin refuses a GET without its header, only
  a query is served over GET, and CORS stays off. `/api/auth/*` is Better Auth's (`api/_auth.ts`),
  ahead of that gate: it checks the Origin of every POST itself, and answers only the routes the
  app uses.
- **Previews sign in through production** (Better Auth's OAuth proxy): only production holds
  `GOOGLE_CLIENT_SECRET`, and `scripts/check-auth-env.ts` fails a deploy whose sign-in settings
  are missing or misplaced.
- **Emailed links never change state on a GET**: mail scanners follow every URL, so approve and
  deny links open app pages that only read until their button sends the mutation.
- **The database changes only through migrations**: edit `api/_db/schema.ts`, then
  `npm run db:generate` and commit `drizzle/`. Vercel's build applies them once the app has
  built (`vercel.json`'s `buildCommand`): production's only from main's code, and preview's
  from every PR's preview, which all share it (`scripts/db-migrate.ts` says what that risks).
  A migration has to work with the code already deployed unless its PR says it accepts a
  minute or two of errors. Each database records its environment, and a deploy refuses
  another's (`api/_db/environment.ts`); a deploy with no database configured fails.
- **The client's GraphQL documents are generated**, and go out as plain strings: no GraphQL
  library in the browser bundle.
- **Report errors through `src/client/sentry.ts`, never `@sentry/react`**: it queues what comes
  before the SDK loads, after the first paint. A static import of Sentry puts it back in every
  visit's bundle, and fails the build.
- **The chat's daily cap fails closed** (the only paid API); every other rate limiter fails
  open.
- **The service worker is blocked in e2e** (`serviceWorkers: 'block'`), as requests it answers
  never reach `page.route`; only `e2e/offline.spec.ts` lets it run, its `goOffline` aborting
  what `setOffline` leaves online.
- **Tests that run git must not inherit the hooks' `GIT_*` variables**, or they act on this
  repository: pre-push unsets them, and such a test strips them itself
  (`.github/scripts/eval-should-grade.test.mjs`).
- **`rules-text/**` reaches `api/graphql.ts` only through `vercel.json`'s `includeFiles`**, by
  the slug-named paths `games.ts` gives each rulebook. Re-run `npm run rules-text` after
  changing a PDF (a newly added scan first gets `npm run rules-text-layer`, its OCR text
  layer); keep the quality test's allowlist short, with a reason for each file.
- **`api` and `src` can't import each other, and `sw.ts` imports no module the app also
  imports.** Values both sides need are written twice, kept in step by tests; the API's shapes
  reach `src` only through codegen reading `api/_schema.graphql`.
- **Never hand-edit the generated `src/data/gameWeights.ts` and `wishlistArt.ts`**; re-run
  their scripts.
- **Colours are tokens, never literals**: `--color-*` in `src/index.css`'s `@theme`, redefined
  for dark, used as classes (`text-text2`, a tint by modifier: `bg-gold/12`).
  `e2e/theme.spec.ts` holds both themes to AA. Messages use `Notice`, not a one-off coloured
  box. Focus is handed over by `data-focus-target`, never a class (`src/client/focus.ts`).
- **Don't mix a filter `dispatch` with `navigate()`** in one handler: the dispatch wins and the
  navigation's params are dropped.

## Conventions

- **Phone first.** Design a change for a phone (402px, the newest iPhone Pro) before widening
  it: 44px touch targets (an invisible tap area around a smaller control rather than a bigger
  box, `tapTargetClass` in `sharedClasses.ts`), the main actions in reach of a thumb, as much
  on a screen as reads well. Unprefixed classes are the phone's; wider screens add breakpoint
  variants (`sm:` from 521px up to `2xl:` from 1081px, in `src/index.css`). The `max-*`
  variants carried over from the old `max-width` blocks convert when next touched. Show a UI
  change at phone size in the PR first.
- **Every style is a Tailwind class** (v4), written on the element; there is no other
  stylesheet. `src/index.css` holds the `@theme` (Tailwind's own colours, fonts, type scale and
  the like are dropped, so a class reaches only these, all in px, spacing a 4px step), the dark
  theme's overrides, and only what no class can reach. Text sizes are px in the class
  (`text-[13px]`); shadows are `:root` variables the dark theme changes
  (`shadow-(--shadow-md)`). Class strings components share live in a module beside them
  (`sharedClasses.ts`, `formClasses.ts`, …), in variables named `…Class` so lint reads them; a
  child styled by where it sits takes a prop (`small`, `inRow`) or its parent's variant. A
  class name a test or script finds an element by stays on it, unstyled, listed in
  `eslint.config.js`'s `HOOK_CLASSES`.
- **Unit tests live in `src/__tests__/`** (Vitest + React Testing Library, jsdom), a CI
  helper's or a script's beside it (here instead when it needs the DOM's types, and the eval's,
  with its other tests), all in one suite and gate. They are pure logic or RTL: no real network,
  no real browser. Shared fakes are in `src/__tests__/helpers/` (`fakeRedis`, with `raw` for the
  raw client; `testDb`, a fresh migrated database per test; `stubMatchMedia`; `api`, the whole
  GraphQL API in process over fakes; `graphqlFetch`, a fetch answering the client's operations
  by name).
- **End-to-end tests live in `e2e/`** (Playwright, the production build): a real browser,
  still no real network. Import `test` and `expect` from `./fixtures`, which stubs every
  `/api/*` call (`stubOperation`, the rules chat as an event stream) and fails a test making an
  unstubbed one. Wait with web-first assertions, never a timer; a spec may import `src/data`,
  nothing else from the app. A new user-facing flow gets a test here, a phone flow in
  `e2e/phone.spec.ts`, and a new page or state a visual scenario (`e2e/visual.ts` says how).
- **Pure utilities stay pure.** `src/utils/` and `src/context/filterReducer.ts` have no side
  effects (no network, storage or clock), so they test directly; dependency-cruiser checks only
  what they import.
- **An export only a command-line caller uses is tagged `@public`**, so the weekly audit's knip
  doesn't count it unused.
