# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

**The Game Room** — a SPA for a personal board game collection: filter and
sort it, pick at random, read rule PDFs with an AI rules assistant, keep
score (7 Wonders, Ticket to Ride, Dominion, the card games), check a
Bananagrams word, vote on a wishlist. Installable
and usable offline. React 19 + TypeScript + Vite, on Vercel with a small API.

## Commands

```bash
npm install          # install dependencies
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # npm run typecheck, then vite build -> dist/
npm run typecheck    # TypeScript 7 `tsc -b` across the project refs
npm run typecov      # type-coverage: every tsconfig project at 100%
npm run lint         # eslint . (flat config; includes jsx-a11y static checks)
npm run format       # prettier --write . (format:check is CI's read-only check)
npm run depcruise    # dependency-cruiser: layering rules (.dependency-cruiser.cjs)
npm run preview      # serve the production build locally
# `npm install` also runs `prepare`, pointing core.hooksPath at .githooks/

# Tests — there is no `npm test` script; call vitest directly:
npx vitest                              # watch mode
npx vitest run                          # single run (CI uses this)
npx vitest run --coverage               # with coverage (thresholds enforced)
npx vitest run src/__tests__/a11y.test.tsx   # accessibility suite only
npm run test:mutation                   # StrykerJS, full run (mutation.yml calls
                                        # `npx stryker run --incremental` itself)

# End-to-end (Playwright, Chromium): builds the app, serves it with
# `vite preview` on port 4174, and drives it with every /api call stubbed
npm run test:e2e
npx playwright test e2e/home.spec.ts    # one spec file
npx playwright test --project=visual-chromium   # one engine's screenshots
npx playwright show-report              # open the last HTML report

# A PR's before/after GIFs: builds main and this tree, plays a scenario
# (e.g. scripts/pr-gif-example.ts) against both, writes pr-gif/<name>/
npm run pr-gif -- <scenario.ts> [--side-by-side] [--publish]
```

`npm run test:e2e` needs a Chromium matching the installed `@playwright/test`
(`npx playwright install chromium`). Where a different preinstalled build has
to stand in, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at it.

Node 24 is used in CI; run the unit tests under it before pushing when your
local Node differs (`npx -y node@24 node_modules/vitest/vitest.mjs run`):
some web APIs differ between versions (a jsdom `Blob` test passed on 22 and
failed on 24). Git hooks in `.githooks/` run the checks locally:
**pre-commit** eslint + Prettier on the staged files + dependency-cruiser +
`tsc -b`; **pre-push** the tests the push can affect (its header says which)
+ the production build, leaving the coverage gate to CI. Both no-op when `$CI` is set.

## Architecture map

Each module's header comment or JSDoc says what it does and why; read it
before changing the module.

- **`src/main.tsx`** — entry and routes (listed in its header); **`App.tsx`**
  the layout shell and `HomePage`; `instrument.ts` Sentry's SDK, fetched once
  the page is up by `client/sentry.ts`.
- **`src/data/`** — `games.ts`, the collection's source of truth (compiled
  in, no database on the read path); `types.ts` its shapes.
- **`src/context/`** — the filter store (`FilterContext.tsx`,
  `filterReducer.ts`, `useFilterUrlSync.ts`), wishlist, owner session.
- **`src/components/`** — pages `RulesPage` (`PdfReader`, `RulesChat`,
  `SaveOffline`), `ScoreCalculatorPage` (its pads listed in
  `data/scoreCalculators.ts`), `WordCheckerPage`, `SignInPage`;
  home `Hero`, `FilterBar/`, `GameCard`, `GameRow`, `Wishlist`.
- **`src/hooks/`** hooks; **`src/utils/`** pure helpers; **`src/client/`**
  side-effecting browser modules; **`src/pdfjs/`** the reader's pdf.js;
  **`src/sw/`** the service worker; **`src/App.css`** every style.
- **`api/`** — Vercel Functions `chat.ts` (Gemini), `votes.ts`,
  `suggestions.ts`, `auth.ts`, each headed by its routes and rules;
  `api/_lib/` what they share (Redis, Resend, BGG, sessions, limits).
- **`scripts/`** — `npm run rules-text` (`extract-rules-text.mjs`, into
  `rules-text/`), `game-weights`, `wishlist-art`, `collection-art`;
  **`eval/`** the assistant's eval; **`vite.config.ts`** the build.
- **External services** — Gemini (`api/chat.ts`), Upstash Redis
  (`api/_lib/redis.ts`), Resend (`api/_lib/mail.ts`), Sentry
  (`src/client/sentry.ts`, `src/instrument.ts`, `api/_lib/sentry.ts`),
  BoardGameGeek (`api/_lib/bgg.ts`, the art and weight scripts), Wiktionary
  (`src/client/dictionary.ts`).

## Invariants and gotchas

- **TypeScript 7 runs side by side with the TypeScript 6 API.** TS 7 (the
  native compiler) has no JavaScript API, which typescript-eslint loads via
  `require('typescript')`; so `@typescript/native` aliases `typescript@7`
  and `typescript` aliases `@typescript/typescript6`. Which `tsc` wins can
  change on any `npm install`: type-check with `npm run typecheck`, never
  bare `npx tsc`. Drop the aliases once typescript-eslint supports TS 7.
- **`patches/` holds `patch-package` fixes** (on `postinstall`): Stryker's
  vitest runner naming tests as Vitest 5 matches them (stryker-js#6210;
  without it every mutant survives), and a pdf.js range rejection marked
  handled (an unhandled AbortError otherwise). Delete each once upstream
  fixes it. Neither package is pinned: a changed release fails to patch,
  which fails CI's install.
- **PR workflows must not use a workflow-level `paths:` filter**: a required
  check that never reports blocks the PR forever. Decide inside the job and
  skip the expensive step (a skipped step still reports success).
- **Owner mutations must be JSON.** CSRF protection is the session cookie's
  SameSite=Lax, then the JSON media type (`api/_lib/session.ts`), which a
  cross-site form can't send without a preflight.
- **Emailed links never change state on a GET**: mail scanners follow every
  URL, so approve/deny and sign-in links open a page whose form POSTs.
- **Report errors through `src/client/sentry.ts`, never `@sentry/react`**:
  it queues what comes before the SDK loads, after the first paint. A static
  import of Sentry puts it back in every visit's bundle, and fails the build.
- **The chat's daily cap fails closed** (the only paid API); every other
  rate limiter fails open.
- **The service worker is blocked in e2e** (`serviceWorkers: 'block'`), as
  requests it answers never reach `page.route`; only `e2e/offline.spec.ts`
  lets it run, its `goOffline` aborting what `setOffline` leaves online.
- **Tests that run git must not inherit the hooks' `GIT_*` variables**, or
  they act on this repository: pre-push unsets them, and such a test strips
  them itself (`.github/scripts/eval-should-grade.test.mjs`).
- **`rules-text/**` reaches `api/chat.ts` only via `vercel.json`'s
  `includeFiles`**, by the slug-named paths `games.ts` gives each rulebook.
  Re-run `npm run rules-text` after changing a PDF (a newly added scan
  first gets `npm run rules-text-layer`, its OCR text layer); keep the
  quality test's allowlist short, with a reason for each file.
- **`api` and `src` can't import each other; `sw.ts` imports no module the
  app also imports** (the build fails otherwise). Values both sides need are
  written twice, kept in step by tests.
- **Never hand-edit the generated `src/data/gameWeights.ts` and
  `wishlistArt.ts`**; re-run their scripts.
- **Colours are tokens, never literals**; `e2e/theme.spec.ts` holds both
  themes to AA. Messages use `Notice`, not a one-off coloured box. Focus is
  handed over by `data-focus-target`, never a class (`src/client/focus.ts`).
- **Don't mix a filter `dispatch` with `navigate()`** in one handler: the
  dispatch wins and the navigation's params are dropped.

## Conventions

- **TypeScript strict everywhere.** One solution of configs, each extending
  `tsconfig.base.json` (the shared strict options): `tsconfig.{app,api,node,
  eval,sw,e2e}.json` for `src` (DOM), `api` (Node), `vite.config.ts`, `eval`,
  `src/sw` (WebWorker) and `e2e`. `npm run build` runs `tsc -b` over all.
- **No `any` anywhere.** `npm run typecov` holds every tsconfig project to
  100% type coverage: an untyped `JSON.parse`, `res.json()`, `req.body`,
  `Array.isArray` element or library field is typed where it's read (a
  `: unknown` and a guard, or the shape it has), never ignored.
  `npx type-coverage -p tsconfig.app.json --detail` lists what's untyped.
- **Prettier owns layout** (`.prettierrc.json`); ESLint's layout rules are
  off (`eslint-config-prettier`, last in the config). `.prettierignore` keeps
  it off prose (`*.md`) and off what a script writes.
- **No exact version pins.** Every dependency in `package.json` takes a range
  (`^`, `~`); the lockfile fixes what gets installed.
  `dependencyRanges.test.ts` fails on an exact version.
- **Tests live in `src/__tests__/`** (Vitest + React Testing Library, jsdom).
  Coverage thresholds are enforced **per file at 80% lines** (`vite.config.ts`),
  so new reducer actions, filter utilities, and API handlers need their own
  tests. Tests must be pure logic or RTL — no real network, no real browser.
  A CI helper's test sits beside it (`.github/scripts/*.test.mjs`), as a
  script's does (`scripts/*.test.ts`, or here if it needs the DOM's types),
  in the same suite and gate. Shared fakes: `src/__tests__/helpers/`
  (`fakeRedis`, with `raw` for the raw client; `stubMatchMedia`).
  Property tests (`*.property.test.ts`, fast-check) state an invariant over
  generated inputs, for pure code with one (share links, places, the
  number boxes); a failure prints the seed and shrunk input to replay.
- **End-to-end tests live in `e2e/`** (Playwright, Chromium, the production
  build): a real browser, still no real network. `e2e/fixtures.ts` stubs
  every `/api/*` call, fails a test making an unstubbed one and aborts
  requests off the preview origin (a spec needing the dictionary stubs it).
  Import `test` and `expect` from `./fixtures`. Find elements by role,
  label, placeholder or text, never CSS (`playwright/no-raw-locators`); wait
  with web-first assertions, never a timer. A spec may import `src/data`,
  nothing else from the app. Add a test here for a new user-facing flow.
- **Visual regression is part of e2e** (`e2e/visual.ts`, `visual*.spec.ts`):
  screenshots against baselines, the core pages in Chromium, Firefox and
  WebKit on a desktop and on phones, every state in both themes in desktop
  Chromium. A new page or state gets a scenario there. Baselines are Linux
  CI's: a change meant to move pixels reruns `e2e.yml` by hand with
  `update_snapshots` (it commits them to the branch; push again after), and
  any other diff is a regression.
- **Pure utilities stay pure.** `src/utils/` and `src/context/filterReducer.ts`
  have no side effects and are directly unit-testable. dependency-cruiser
  enforces the layering (utils/data reach no React or app layer, `src/client`
  no React or UI, api and src stay apart, e2e reaches only `src/data`).
- **Validate only at boundaries.** The serverless handlers validate untrusted
  input (slug format, lengths, vote values); don't add defensive checks for
  states that can't occur inside the app.
- **Document behaviour where the code lives**, in the module's header or the
  component's JSDoc, and change it with the code; this file stays a map.
  `eslint-plugin-jsdoc` checks the JSDoc that's written (tags name real
  parameters and parse; TypeScript's types stay out of it) and never asks
  for more.
- **Commit hygiene.** Imperative subject <=72 chars; body explains *why*; end
  with the `Co-Authored-By:` trailer. One logical change per commit; squash
  "fix typo"/"oops" churn before opening or updating a PR. Linear history
  (rebase, not merge); amend your own branch freely, but never amend, rebase,
  or force-push `main`. `check-commits.sh` in CI enforces the shape.
- **Never** `git add -A`/`git add .` (stage files explicitly), modify a test to
  make it pass (fix the implementation instead), install packages outside the
  project root, or use `--no-verify`.
- **Issues are the source of truth.** Check `gh issue list` (and `gh issue
  view <n>`) before designing or implementing a feature — issues carry
  rationale the code doesn't.
- **Show UI changes in the PR.** A PR changing a component or stylesheet puts
  before/after visuals in its description: screenshots for looks, GIFs for
  motion, hosted on the `pr-screenshots` branch as the PR template shows.
  GIFs show the pointer and key presses: record them with `npm run pr-gif`
  (`scripts/record-pr-gif.ts`), from a scenario of real `page.mouse` moves
  with steps and pauses like `scripts/pr-gif-example.ts`; `--publish` hosts
  them on `pr-screenshots` and prints the table, linked by commit SHA.
  `PR visuals` (`.github/scripts/pr-visuals.mjs`) fails one with no picture
  unless "No visible UI change" is ticked; it can't see changes through
  `src/data`, `public/` or `index.html`, so show those too.
- **Review before raising a PR.** Review the full diff (e.g. a review subagent
  reading it) before opening the PR — review gates PR creation, rather than
  opening first and reviewing after.

## CI and required checks

| Required check (workflow) | What it runs |
| --- | --- |
| `ci` (`ci.yml`) | commit messages, lint, Prettier, depcruise, type-check, type coverage (100%), unit tests + coverage (axe suite included), build, `npm audit --omit=dev` (high+) |
| Claude Review (`claude-review.yml`) | AI review, in its own file: claude-code-action skips a PR that edits its workflow |
| StrykerJS (`mutation.yml`) | incremental mutation testing of the files a PR touched, failing below `break` |
| E2E Tests (Playwright) (`e2e.yml`) | the e2e suite and visual regression in three engines; passing only on retry still fails |
| Answer-Quality Eval (`eval.yml`) | the assistant against `eval/golden-set.json` |
| Secret scan, `semgrep-cloud-platform/scan`, Vercel, API smoke test | secrets, static analysis, the deploy and its live API |

**The weekly audit** (`weekly-audit.yml`, Mondays, not a PR check) runs knip
(`knip.jsonc`: dead files, exports and dependencies), jscpd (`.jscpd.json`:
duplicated code outside the tests, which repeat each case's setup on
purpose) and lychee (broken links and anchors in the markdown), and draws
dependency-cruiser's whole graph as an artifact. Each kind of finding keeps
one issue labelled `weekly-audit` (`.github/scripts/tracking-issue.mjs`),
rewritten each week and closed when clean. Each tool reports nothing
today: keep it that way, fixing a finding rather than ignoring it; a
deliberate copy (the dark theme's second block, the API's keyword labels)
says why beside its `jscpd:ignore` marker, and an export only a command-line
caller uses is tagged `@public`.

Every check but `PR visuals` is required (autofix skips that one too), so
nothing merges until all report and arming auto-merge early is safe. A new PR workflow must be
added to the required checks, or bot PRs merge without it; list a gating
`pull_request` workflow in `workflows:` in `claude-autofix.yml` too, or
autofix won't fix its failures. Dependabot's npm PRs auto-merge
(`dependabot-merge.yml`) once every check is green and every review thread
resolved; `claude-autofix.yml` works review comments on bots' PRs and fixes
mechanical breakage from a bump (one attempt per head, two per PR), leaving
behaviour changes (privacy, auth, features, a test's expected values) to
the owner in a comment, and a person's PR to its author. Vercel
(`vercel.json`): SPA rewrites, `maxDuration` per function (chat 60 s, the
rest 10–15 s, none over 60), `/assets/` immutable for a year.

## Environment variables

Copy `.env.example` to `.env.local` (gitignored) and fill in real values. No
secrets belong in tracked source.

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SENTRY_DSN` | client (`src/client/sentry.ts`, `src/instrument.ts`) | Sentry browser DSN (must be `VITE_`-prefixed to reach the browser) |
| `SENTRY_DSN` | serverless (`api/_lib/sentry.ts`, every endpoint) | Sentry Node DSN |
| `GEMINI_API_KEY` | serverless (`api/chat.ts`) | Google Gemini key (server-only) |
| `KV_REST_API_URL` | serverless (`api/_lib/redis.ts`, every endpoint) | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | serverless (`api/_lib/redis.ts`, every endpoint) | Upstash Redis REST token |
| `SENTRY_AUTH_TOKEN` | build (optional) | enables Sentry source-map upload during `vite build` |
| `RESEND_API_KEY` | serverless (`api/_lib/mail.ts`) | Resend key for the suggestion and sign-in emails; suggestions are refused until set |
| `SUGGESTIONS_TO` | serverless (`api/_lib/mail.ts`) | address that receives approve/deny emails; the only address that can sign in as the owner |
| `SUGGESTIONS_FROM` | serverless (optional) | sender; defaults to `The Game Room <onboarding@resend.dev>` |
| `APP_URL` | serverless (optional) | origin for the emailed links; defaults to the Vercel production URL |
| `BGG_API_TOKEN` | serverless (`api/suggestions.ts`) | BoardGameGeek XML API token; unset (BGG isn't called) or refused, adds and approvals still go through with no details or art, the owner is told why (on the add form, in the on-site queue and on the emailed approval page) and Sentry gets an error naming the variable |
