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
npm run depcruise    # dependency-cruiser: layering rules (.dependency-cruiser.cjs)
npm run preview      # serve the production build locally
# `npm install` also runs `prepare`, pointing core.hooksPath at .githooks/

# Tests — there is no `npm test` script; call vitest directly:
npx vitest                              # watch mode
npx vitest run                          # single run (CI uses this)
npx vitest run --coverage               # with coverage (thresholds enforced)
npx vitest run src/__tests__/a11y.test.tsx   # accessibility suite only
npx tsc -b                              # type-check without emitting
```

Node 24 is used in CI. Git hooks in `.githooks/` (activated by `npm install`
via `core.hooksPath`) run the same checks locally so failures surface before
a push: **pre-commit** runs eslint + dependency-cruiser + `tsc -b`;
**pre-push** runs the test suite with coverage + the production build. Both
no-op when `$CI` is set. CI re-runs everything on `ubuntu-latest`.

## Architecture

### Client (`src/`)
- **`main.tsx`** — entry point. Imports `./instrument` first (Sentry), then
  mounts a `createBrowserRouter` with four routes:
  - `/` — `HomePage` (hero, filter bar, then the collection or the wishlist,
    switched by the Own/Want toggle; both stay mounted so a toggle never
    refetches, and only the visible one carries the `#collection` anchor)
  - `/rules/:slug` — bundled rule PDF viewer + AI rules assistant
  - `/score/:slug` — score calculator (currently 7 Wonders)
  - `/word-checker` — dictionary lookup for word games
  - `/sign-in` — the owner's magic-link sign-in (`SignInPage`); nothing on
    the home page links to it
- **`App.tsx`** — layout shell: wraps the router `Outlet` in `FilterProvider`
  and mounts Vercel `Analytics`.
- **`data/`** — the static data layer. `games.ts` is the source of truth for
  the collection; `wishlist.ts`, `keywords.ts`, `initialFilterState.ts`, and
  `types.ts` support it. No database on the read path — the collection is a
  compiled-in constant. `Game` and `WishlistItem` both extend `Filterable`
  (name, desc, min/max players, mins, duration bucket, keywords). The filter
  pipeline (`utils/filterGames.ts`) is generic over it: `filterItems` with
  `filterGames` and `filterWishlist` wrappers that decide their own grouping.
  Both views share the filter bar: `FilterState.collection` (`'own' | 'want'`,
  mirrored to the URL as `c=want`) picks which list the section renders and
  which one the keyword counts tally; `CLEAR_ALL` keeps the mode.
- **`context/`** — filtering state. `FilterContext` holds a `useReducer` store
  (`filterReducer.ts`); `useFilter.ts` is the consumer hook; `useFilterUrlSync.ts`
  keeps filter state mirrored to the URL query string so views are shareable.
  `WishlistContext` is the one definition of the wishlist for the page (static
  entries plus approved friend suggestions, loaded once and reloadable after
  an owner edit) for the wishlist section, the keyword counts and the hero's
  count; `AuthContext` holds the owner-session check that switches admin
  mode on (`SignInPage`, `AdminPanel`, `AdminItemControls`). Its provider
  wraps only the home page and the `/sign-in` route, each with its own
  instance, so the rules, score and word-checker pages never call
  `/api/auth`.
- **`components/`** — presentational + interactive UI (grid/list views, filter
  bar, random picker, rules page, rules chat, word checker, score calculator,
  wishlist + voting). `Icons.tsx` holds inline SVGs. The wishlist wears the
  collection's clothes: `WishlistCard` reuses the `game-card` layout (vote
  heart and buy/video links in the footer) and `WishlistListView` renders
  the collection's table (`GamesTableHead` is the shared sortable header)
  with a vote column and an expanded row for the full blurb, awards, owner
  controls and links; the collapsed row shows the blurb's first sentence
  (`utils/shortDesc.ts`) where a collection row shows its hand-written
  short line. Both sections share the light theme.
- **`utils/`** — pure helpers (`filterGames.ts`, `pickRandom.ts`, `filterUrl.ts`,
  `urls.ts`, `shortDesc.ts`). Keep these free of React and side effects.
- **`instrument.ts`** — Sentry browser SDK init (`@sentry/react`), including
  browser tracing and session replay.

### Serverless API (`api/`) — Vercel Functions (`@vercel/node`)
- **`chat.ts`** — the AI rules assistant. Reads `rules-text/<slug>.txt`, sends
  it plus the recent chat history to Google Gemini (`@google/genai`,
  `gemini-2.5-flash`) and streams the reply back as plain text. Validates slug
  format (must match the same slug regex as `votes.ts`, since it becomes a
  filesystem path), message length (<=500), history length (<=10) and total
  history content size, and caps Gemini output tokens. Per-IP rate limited via
  `_lib/rateLimit.ts`. Errors reported to Sentry (`@sentry/node`).
- **`votes.ts`** — anonymous wishlist voting backed by Upstash Redis
  (`@upstash/redis`). `handleVotes()` is written against small interfaces
  (`VotesRedis`, `VotesRequest`, `VotesResponse`) so it can be unit-tested with
  a fake Redis; the default export wires in the real client. Votes are stored as
  Redis sets keyed `wishlist:votes:<id>`, deduped by an anonymous browser id.
  Per-IP rate limited via `_lib/rateLimit.ts`. Errors reported to Sentry
  (`@sentry/node`).
- **`suggestions.ts`** — friend suggestions with owner approval by email and
  no admin page. `POST` validates, emails the owner (Resend) approve/deny
  links carrying a per-suggestion token, then stores the suggestion as
  `pending`; `GET ?action=approve|deny&id&token` verifies the token and
  renders a confirmation page whose form `POST`s `{ decision, id, token }`
  to flip the status (a bare GET never mutates, because mail link-scanners
  follow every URL); plain `GET` lists approved suggestions, which the
  wishlist renders under "Suggested by friends". Redis keeps one hash per
  suggestion plus two id lists, `suggestions:active` (pending + approved,
  for duplicate checks) and `suggestions:approved` (the public list).
  A new suggestion is stored before the email is sent so the emailed links
  always resolve; if the send call fails the record is dropped from the
  active list and marked `unsent` (tracked on `suggestions:unsent`) so the
  suggester can retry, but its links keep working (a timeout can follow a
  real delivery), it still shows in the owner's on-site queue, and
  approving an unsent record returns it to the active list. On approval the handler
  looks the game up on BoardGameGeek (`_lib/bgg.ts`, XML API 2, bearer token
  from `BGG_API_TOKEN`) and stores players, playing time, a two-sentence
  description, year, mapped keywords and the box-art thumbnail URL as a
  `details` JSON field, so the card renders and filters like any other
  wishlist entry; a miss, an outage or a missing token still approves with
  details empty. `handleSuggestions()`
  takes `{ redis, mailer, baseUrl, lookup, admin }` so the mailer, the BGG
  lookup and the session check are spies in tests. With no
  Resend configuration the endpoint returns 503 rather than storing a
  suggestion the owner would never see. A signed-in owner (see `auth.ts`)
  can also work the list from the site: `GET ?action=pending` lists the
  queue, `POST { decision, id }` without a token decides one, `POST
  { action: 'add', game, name, note?, type? }` puts a game straight on the
  wishlist (stored approved with `source: 'owner'`, enriched the same way),
  `PATCH { id, game?, note?, details? }` edits how it reads (players, time,
  description, keywords, section) and `DELETE { id }` takes it off (status
  `removed`, hash kept, lists forget it). Every owner mutation must be a
  JSON request: a cross-site form can post urlencoded bodies with the
  cookie attached but cannot send JSON without a preflight, so the
  content type is the CSRF check.
- **`auth.ts`** — owner sign-in by magic link, so there is an admin mode but
  no password. `POST { email }` answers the same for every address and, only
  when it matches `SUGGESTIONS_TO`, emails a single-use link (a random token
  in Redis with a 15-minute TTL). The link opens a confirmation page whose
  form `POST`s `{ action: 'verify', token }` (mail scanners follow links, so
  a bare GET never signs anyone in); that consumes the token with `getdel`,
  stores a session id for 30 days and sets it as an HttpOnly, Secure,
  SameSite=Lax cookie. `GET` reports `{ admin }` for the cookie it carries;
  `POST { action: 'logout' }` deletes the session. Helpers in
  `_lib/session.ts` (cookie parsing, `isAdmin`, the JSON check) and
  `_lib/mail.ts` (Resend, the public origin, the standalone pages) are
  shared with `suggestions.ts`. Link requests are rate limited per IP.

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
- **BoardGameGeek** — the XML API 2 does the server-side lookup of an
  approved suggestion's details and box art by name (needs a registered
  token, `BGG_API_TOKEN`; answers 202 while queuing, retried once). Every
  compiled-in wishlist entry carries its BoardGameGeek id (`bgg`), and
  `npm run wishlist-art` fetches each one's 200x200 box art by that id from
  the site's own item endpoint, which needs no token, into
  `public/images/wishlist/` and the generated `src/data/wishlistArt.ts`.

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
| `RESEND_API_KEY` | serverless (`api/suggestions.ts`) | Resend key for the suggestion approval email; suggestions are refused until set |
| `SUGGESTIONS_TO` | serverless (`api/suggestions.ts`, `api/auth.ts`) | address that receives approve/deny emails; the only address that can sign in as the owner |
| `SUGGESTIONS_FROM` | serverless (optional) | sender; defaults to `The Game Room <onboarding@resend.dev>` |
| `APP_URL` | serverless (optional) | origin for the emailed links; defaults to the Vercel production URL |
| `BGG_API_TOKEN` | serverless (`api/suggestions.ts`) | BoardGameGeek XML API token; without it approvals go through with no details or art |

## Conventions

- **TypeScript strict everywhere.** Three project configs under one solution:
  `tsconfig.app.json` (`src`, DOM libs), `tsconfig.api.json` (`api`, Node libs),
  `tsconfig.node.json` (`vite.config.ts`). `npm run build` runs `tsc -b` across
  all of them.
- **Tests live in `src/__tests__/`** (Vitest + React Testing Library, jsdom).
  Coverage thresholds are enforced **per file at 80% lines** (`vite.config.ts`),
  so new reducer actions, filter utilities, and API handlers need their own
  tests. Tests must be pure logic or RTL — no real network, no real browser.
- **Pure utilities stay pure.** Filtering/sorting/URL logic in `src/utils/` and
  `src/context/filterReducer.ts` should have no side effects and be directly
  unit-testable. The import side of this (utils/data may not reach React or
  app layers, api and src stay separate) is enforced by dependency-cruiser
  (`.dependency-cruiser.cjs`, run in CI).
- **Validate only at boundaries.** The serverless handlers validate untrusted
  input (slug format, lengths, vote values); don't add defensive checks for
  states that can't occur inside the app.
- **Commit hygiene.** Imperative subject <=72 chars; body explains *why*; end
  with the `Co-Authored-By:` trailer. One logical change per commit; squash
  "fix typo"/"oops" churn before opening or updating a PR. Linear history
  (rebase, not merge). Amend or squash your own feature branch freely before it
  merges, but never amend, rebase, or force-push `main`.
- **Never** `git add -A`/`git add .` (stage files explicitly), modify a test to
  make it pass (fix the implementation instead), install packages outside the
  project root, or use `--no-verify`.
- **Issues are the source of truth.** Check `gh issue list` (and
  `gh issue view <n>`) before designing or implementing a feature — issues
  carry rationale the code doesn't.
- **Review before raising a PR.** Review the full diff (e.g. a review subagent
  reading it) before opening the PR — review gates PR creation, rather than
  opening first and reviewing after.

## Deployment

Vercel (`vercel.json`): `framework: vite`, output `dist/`, SPA rewrites send
non-API, non-file routes to `index.html`, and `api/*` maps to the serverless
functions. CI (`.github/workflows/ci.yml`) runs lint, type-check, a11y tests,
unit tests with coverage, and a build on `ubuntu-latest` for every PR to `main`,
followed by an automated Claude review; `claude-autofix.yml` addresses
unresolved review comments. `mutation.yml` runs StrykerJS over the source
files a PR touched and fails below the `break` score in
`stryker.config.json` (a weekly full sweep applies the same bar). All CI runs
on GitHub-hosted `ubuntu-latest` runners.

Every PR check is a required status check on `main` (`ci`, Claude Review,
Secret scan, StrykerJS, Answer-Quality Eval, Semgrep, Vercel, API smoke
test), so nothing merges until all of them report. A required check that
never reports blocks the PR forever, so PR workflows must not use a
workflow-level `paths:` filter; decide inside the job instead and skip the
expensive step (a skipped step still reports success). Don't arm auto-merge
until every check has reported.
