# Contributing

## Setup

Node 24, as CI uses (`.nvmrc`); the scripts need at least 22.18, for `import.meta.main`. Vercel's
build keeps the Node version set in the project's settings.

```bash
git clone https://github.com/jbhirsh/BoardGames.git
cd BoardGames
npm install                  # also points core.hooksPath at .githooks/
cp .env.example .env.local   # fill in values for the features you want to run
npm run dev                  # http://localhost:5173
```

The collection, filters, random picker and score pads run with no configuration. The rules
assistant, wishlist, suggestions, sign-in and monitoring need the variables below, in
`.env.local` (gitignored; no secret belongs in tracked source).

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SENTRY_DSN` | client | Sentry browser DSN (`VITE_`-prefixed to reach the browser) |
| `SENTRY_DSN` | serverless | Sentry Node DSN |
| `GEMINI_API_KEY` | serverless | Google Gemini key, for the rules assistant |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | serverless | Upstash Redis REST URL and token |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | build and serverless | the deployment's Turso database and its token, set in Vercel per environment |
| `DEV_DB_PATH` | local (optional) | a SQLite file used in place of Turso for development |
| `SENTRY_AUTH_TOKEN` | build (optional) | Sentry source-map upload during `vite build` |
| `BETTER_AUTH_SECRET` | serverless; checked at build | signs the session cookie; production's and preview's each their own |
| `GOOGLE_CLIENT_ID` | serverless; checked at build | the Google OAuth client (Web application) |
| `GOOGLE_CLIENT_SECRET` | serverless, production only; checked at build | its secret: only production exchanges a code, for itself and for previews; a preview build that has it fails |
| `OAUTH_PROXY_SECRET` | serverless; checked at build | the same value in production and every preview: previews sign in through production |
| `RESEND_API_KEY` | serverless | Resend key for the suggestion emails; suggestions are refused until set |
| `SUGGESTIONS_TO` | serverless; production's checked at build | address that gets approve and deny emails; the Google account that signs in as the owner |
| `SUGGESTIONS_FROM` | serverless (optional) | sender; defaults to `The Game Room <onboarding@resend.dev>` |
| `APP_URL` | serverless (optional) | origin for the emailed links; defaults to the production URL |
| `BGG_API_TOKEN` | serverless | BoardGameGeek token; without it suggestions still go through, with no details or art, and the owner is told why |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run preview` | the dev server / the production build, served locally |
| `npm run build` | type-check, then build to `dist/` |
| `npm run typecheck` / `npm run typecov` | TypeScript 7 over every project / type coverage at 100% |
| `npm run lint` / `npm run lint:fix` | ESLint (accessibility and Tailwind rules included) / its fixes |
| `npm run format` | Prettier |
| `npm run depcruise` | the import layering rules (`.dependency-cruiser.cjs`) |
| `npm run codegen` | typed GraphQL documents into `src/gql/` |
| `npm run db:generate` / `npm run db:migrate` | a migration in `drizzle/` / apply them to the development database |
| `npx vitest run` | unit tests (`--coverage` for the per-file 80% gate) |
| `npm run test:e2e` | build, serve on port 4174 and run the Playwright suite (`npx playwright test --project=phone` for one project) |
| `npm run test:mutation` | StrykerJS over the whole scope; `npx stryker run --mutate <file>` while iterating, report in `reports/mutation/` |
| `GEMINI_API_KEY=... npm run eval` | the rules assistant against `eval/golden-set.json` (real Gemini calls) |
| `npm run pr-gif -- <scenario.ts> --dir <PR>` | a PR's before/after GIFs, hosted on the `screenshots` branch |

The git hooks run lint, Prettier, the layering rules and the type-check on commit, and the
tests a push can affect plus the build on push; both do nothing when `$CI` is set.

## Required checks

| Check (workflow) | What it runs |
| --- | --- |
| `ci` (`ci.yml`) | commit messages, pins, lint, Prettier, layering, type-check, GraphQL codegen and database migrations drift, type coverage, unit tests with coverage (the axe suite included), unmeasured source files, build, `npm audit --omit=dev` (high and up) |
| Claude Review (`claude-review.yml`) | jbhirsh/ci's AI review; this repo's guide is `.github/claude-review.md` |
| StrykerJS (`mutation.yml`) | mutation testing of the lines a PR changed; the monthly full sweep (`mutation-sweep.yml`) isn't a PR check |
| E2E Tests (Playwright) (`e2e.yml`) | the e2e suite and visual regression in three engines |
| Answer-Quality Eval (`eval.yml`) | the rules assistant against the golden set, when its code changes |
| PR visuals (`pr-visuals.yml`) | a UI change has pictures in its description |
| Secret scan, `semgrep-cloud-platform/scan`, Vercel, API smoke test | secrets, static analysis, the deploy, and its live API (`smoke.yml`) |

The CI tooling is shared with fog-and-frontier and sift from
[jbhirsh/ci](https://github.com/jbhirsh/ci); this repo's settings for each tool are its key in
`.github/ci.json`.

## One-time setup

- **Actions secrets:** `CLAUDE_CODE_OAUTH_TOKEN` (Claude Review and the autofix workflows),
  `GEMINI_API_KEY` (the eval), `VERCEL_AUTOMATION_BYPASS_SECRET` (lets the smoke test through
  Vercel Authentication on previews) and `BOT_PR_TOKEN`, a fine-grained token
  for this repository with Contents and Pull requests read and write. The README screenshot bot
  opens its PR with it: a PR the default Actions token opens starts no workflows, so its
  required checks would never report. Without it the default token is used, which also needs
  Settings, Actions, General: "Allow GitHub Actions to create and approve pull requests".
- **Pages:** Settings, Pages: Deploy from a branch, `job-reports`, `/ (root)`, for each job's
  report.
- **The shared Claude rules:** sessions read them from jbhirsh/ci; on your own computer, link
  them once as its `CONTRIBUTING.md` says ("The shared Claude rules").
- **Blame:** `git config blame.ignoreRevsFile .git-blame-ignore-revs`, so local blame skips the
  one-time reformat (GitHub's blame already does).

## Deployment

Vercel (`vercel.json`): the build served from `dist/`, SPA routes falling back to
`index.html`, and `/api/graphql` the one function, bundling `rules-text/**` for the rules
assistant. The build applies the database's migrations once the app has built.
