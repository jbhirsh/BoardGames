This is "The Game Room", a React 19 + TypeScript SPA (Vite, Vitest, React
Router) for a personal board game collection, with one Vercel Function in
`api/` (GraphQL Yoga).

### Focus

- Logic errors and edge cases in filtering and sorting.
- The `FilterContext` reducer pattern, and `src/data/` as the collection's
  compiled-in source of truth (no database on the read path).
- Pure utilities: `src/utils/` and `src/context/filterReducer.ts` have no
  side effects (dependency-cruiser checks only what they import, not, say, a
  `Date.now()` or a `localStorage` read).

### Server API (`api/`)

The GraphQL resolvers (`api/_resolvers/`, served by `api/graphql.ts`) are
the trust boundary. Flag:

- An owner-only operation (listing the queue, previewing, deciding without
  a token, adding, editing or removing) that doesn't go through
  `requireAdmin` in `_resolvers/context.ts`: the owner check (a Better Auth
  session whose verified email is `SUGGESTIONS_TO`, `api/_auth.ts`), plus a JSON
  POST for mutations. Requiring JSON is the CSRF protection (with the
  `jsonOnly` guard and Yoga's CSRF plugin in `_resolvers/index.ts`): a
  cross-site form can post urlencoded data with the cookie attached but
  can't send JSON without a preflight. Mutations must never be served over
  GET, and CORS stays off.
- An emailed-link flow (approve/deny) that changes state on a plain GET,
  since mail scanners follow every link, or that doesn't verify its token.
- A Better Auth route answering under `/api/auth/*` that the app doesn't
  use (`allowedRoute` in `api/_auth.ts`), production answering the OAuth
  proxy's completion route, Google's client secret reaching a preview, or
  an ID-token sign-in turned back on (`disableIdTokenSignIn`).
- A new endpoint or parameter that takes untrusted input without validating
  it (slug format, lengths, counts, allowed values).
- A new public (unauthenticated) path that writes data, sends mail or calls
  a paid API without the per-IP limit from `_lib/rateLimit.ts`
  (`enforceRateLimit`), as voting, chat and suggesting have. Sign-in has
  none, by the owner's decision on #296.
- A caught error in a handler that isn't reported to Sentry.
- The session cookie losing `HttpOnly`, `Secure` or `SameSite=Lax`, or
  Better Auth's origin check being turned off (`disableOriginCheck`).
- An external call (Gemini, Resend, BoardGameGeek) whose failure breaks a
  path CLAUDE.md says keeps working: a BoardGameGeek miss still approves the
  suggestion, and missing Resend configuration returns 503 rather than
  storing a suggestion.

### Where the data lives

Redis holds live production data that outlives every deploy: the vote sets
(`wishlist:votes:<id>`), the suggestion hashes and the `suggestions:active` /
`suggestions:approved` / `suggestions:unsent` lists and rate-limit
counters; Turso holds the owner's sign-in (Better Auth's `auth_*` tables).
Each browser also keeps
localStorage: the anonymous voter id (`wishlist:anonId`), which dedupes
votes, and the remembered display name (`gameroom:name`). A renamed key or
changed shape orphans existing records or makes them unreadable, and a
renamed voter id lets every browser vote again.
