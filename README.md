# The Game Room

A single-page web app for browsing a personal board game collection — filter and
sort 26 games by length, player count, and vibe; get a "pick for us" random
suggestion; read bundled rulebooks; ask an **AI rules assistant**; tally a
**7 Wonders** score; check whether a word is playable in **Bananagrams**; and
vote on a shared wishlist.

Built with React 19 + TypeScript on Vite, with a small set of Vercel serverless
functions for the AI and voting features.

![The Game Room — collection grid with filters and stats](docs/screenshots/collection-grid.png)

## Highlights

- **Fast, shareable filtering.** Duration, player count, and keyword filters plus
  full-text search and multiple sort modes, driven by a `useReducer` store that
  mirrors its state into the URL — so any filtered view can be copied and shared.
- **Grid and list views** over the same 26-game collection, with a one-click
  random "pick for us" suggestion.
- **AI rules assistant.** Each game's rulebook PDF is extracted to text and fed to
  Google Gemini, which answers rules questions grounded only in that game's rules
  and streams the reply token-by-token.
- **7 Wonders score calculator** with the full scoring model, including the
  quadratic science formula.
- **Bananagrams word checker** backed by a public dictionary API.
- **Anonymous wishlist voting** stored in Upstash Redis.
- **Accessibility-tested UI** — `eslint-plugin-jsx-a11y` static checks plus
  `axe-core` assertions on rendered components in CI.

## Screenshots

| AI rules assistant | Word checker | 7 Wonders score calculator |
| --- | --- | --- |
| ![AI rules assistant answering a Catan question](docs/screenshots/rules-assistant.png) | ![Word checker validating a word](docs/screenshots/word-checker.png) | ![7 Wonders score calculator](docs/screenshots/score-calculator.png) |

A sortable list view is also available:

![Collection list view](docs/screenshots/home.png)

> The AI-assistant and word-checker screenshots use locally stubbed API responses
> purely for capture; the app calls the real services at runtime.

## Tech stack

- **Frontend:** React 19, TypeScript 5.9 (strict), React Router 7, Vite 8
- **Content:** `react-markdown` for AI answers; rule PDFs rendered inline
- **Backend:** Vercel serverless functions (`@vercel/node`)
- **AI:** Google Gemini via `@google/genai` (`gemini-2.5-flash`, streamed)
- **Data / KV:** Upstash Redis (`@upstash/redis`) for wishlist votes
- **Monitoring:** Sentry (browser + serverless) and Vercel Analytics
- **Testing:** Vitest 4, React Testing Library, jsdom, `axe-core` / `vitest-axe`
  (per-file 80% line coverage enforced)
- **Tooling:** ESLint 9 (flat config, `typescript-eslint`, `jsx-a11y`,
  `react-hooks`), Node 24
- **Rules pipeline:** `unpdf` for text extraction with a `tesseract.js` OCR
  fallback for image-only PDFs

## Getting started

```bash
git clone https://github.com/jbhirsh/BoardGames.git
cd BoardGames
npm install

cp .env.example .env.local   # fill in values for any feature you want to run
npm run dev                  # http://localhost:5173
```

The core collection, filtering, random picker, and score calculator run with no
configuration. The AI assistant, wishlist voting, and Sentry monitoring need the
corresponding environment variables — see [`.env.example`](.env.example) for the
full list (Sentry DSNs, `GEMINI_API_KEY`, and Upstash Redis credentials). Real
secrets live in `.env.local`, which is gitignored.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint (includes static a11y checks) |
| `npx vitest run` | Run the test suite once (`--coverage` to enforce thresholds) |

## Architecture

- `src/` — the React SPA: static data layer (`src/data/`), filter state and URL
  sync (`src/context/`), pure helpers (`src/utils/`), and UI (`src/components/`).
- `api/` — Vercel serverless functions: `chat.ts` (Gemini rules assistant) and
  `votes.ts` (Upstash Redis wishlist voting).
- `scripts/` — the PDF-to-text pipeline that generates `rules-text/` from
  `public/rules/*.pdf` for the AI assistant.
- CI runs lint, type-check, accessibility tests, unit tests with coverage, and a
  production build on every PR (`.github/workflows/`).

See [`CLAUDE.md`](CLAUDE.md) for a deeper tour of the codebase and conventions.

## Deployment

Deployed on **Vercel** (`vercel.json`): the Vite build is served from `dist/`,
SPA routes fall back to `index.html`, and `api/*` maps to the serverless
functions. The `api/chat.ts` function bundles `rules-text/**` so it can read a
game's rules at request time.
