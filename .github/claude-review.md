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
  `requireAdmin` in `_resolvers/context.ts`: the session check, plus a JSON
  POST for mutations. Requiring JSON is the CSRF protection (with the
  `jsonOnly` guard and Yoga's CSRF plugin in `_resolvers/index.ts`): a
  cross-site form can post urlencoded data with the cookie attached but
  can't send JSON without a preflight. Mutations must never be served over
  GET, and CORS stays off.
- An emailed-link flow (approve/deny, magic-link sign-in) that changes state
  on a plain GET, since mail scanners follow every link, or that doesn't
  verify its token. Sign-in tokens must stay single-use (`getdel`).
- A new endpoint or parameter that takes untrusted input without validating
  it (slug format, lengths, counts, allowed values).
- A new public (unauthenticated) path that writes data, sends mail or calls
  a paid API without the per-IP limit from `_lib/rateLimit.ts`
  (`enforceRateLimit`), as voting, chat, suggesting and sign-in requests
  have.
- A caught error in a handler that isn't reported to Sentry.
- The session cookie losing `HttpOnly`, `Secure` or `SameSite=Lax`.
- An external call (Gemini, Resend, BoardGameGeek) whose failure breaks a
  path CLAUDE.md says keeps working: a BoardGameGeek miss still approves the
  suggestion, and missing Resend configuration returns 503 rather than
  storing a suggestion.

### Where the data lives

Redis holds live production data that outlives every deploy: the vote sets
(`wishlist:votes:<id>`), the suggestion hashes and the `suggestions:active` /
`suggestions:approved` / `suggestions:unsent` lists, sessions and magic-link
tokens (`auth:*`) and rate-limit counters. Each browser also keeps
localStorage: the anonymous voter id (`wishlist:anonId`), which dedupes
votes, and the remembered display name (`gameroom:name`). A renamed key or
changed shape orphans existing records or makes them unreadable, and a
renamed voter id lets every browser vote again.
