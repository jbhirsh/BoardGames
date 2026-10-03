import { test as base, expect, type Page, type Request } from '@playwright/test';

/**
 * Shared setup for every spec: the page runs against deterministic stubs for
 * the serverless API, and nothing it requests leaves the machine. Specs
 * import `test` and `expect` from here, not from '@playwright/test'.
 */

/** The anonymous voter id the page finds in localStorage, so vote bodies are exact. */
export const ANON_ID = 'e2e-anon-00000001';

/** One approved friend suggestion, shaped like `publicView` in api/suggestions.ts. */
export const SUGGESTION = {
  id: 'sug-0e2e0e2e0e2e',
  game: 'Fixture Quest',
  name: 'Robin',
  note: 'We loved it at game night',
  status: 'approved',
  createdAt: Date.UTC(2026, 0, 10),
  decidedAt: Date.UTC(2026, 0, 11),
  source: 'friend',
  details: { min: 2, max: 4, mins: 30, desc: 'A made-up game for the end-to-end tests.', kw: ['strategy'] },
} as const;

/** Stored vote counts; `GET /api/votes` reports 0 for every other id it is asked about. */
export const VOTE_COUNTS: Record<string, number> = { splendor: 3, [SUGGESTION.id]: 1 };

/** The rules assistant's stubbed reply, in Markdown as the model writes it. */
export const CHAT_ANSWER = 'Yes. **Every player** answers each question, then you vote.';

interface ApiStubs {
  /** `/api/*` requests no stub claims; the test fails if any were made. */
  unexpected: string[];
}

function jsonBody(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

async function stubBackend(page: Page, baseURL: string, unexpected: string[]): Promise<void> {
  const origin = new URL(baseURL).origin;
  const isApi = (url: URL, path: string) => url.origin === origin && url.pathname === path;

  // Playwright tries routes newest first, so this catch-all goes in first and
  // every stub below takes precedence over it. Anything off this origin (Google
  // Fonts, a missed stub, the dictionary when a spec doesn't stub it) is
  // aborted rather than reaching the network.
  await page.route((url) => url.origin !== origin, (route) => route.abort('blockedbyclient'));

  // An /api call none of the stubs below handles: answer it, but record it so
  // the test fails instead of silently passing on a 404.
  await page.route(
    (url) => url.origin === origin && url.pathname.startsWith('/api/'),
    (route) => {
      unexpected.push(`${route.request().method()} ${route.request().url()}`);
      return route.fulfill({ status: 501, body: 'not stubbed' });
    },
  );

  // Vercel Analytics loads its script from the deployment; preview has none.
  await page.route(
    (url) => url.origin === origin && url.pathname.startsWith('/_vercel/'),
    (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );

  await page.route((url) => isApi(url, '/api/auth'), (route) =>
    route.request().method() === 'GET' ? route.fulfill(jsonBody({ admin: false })) : route.fallback(),
  );

  await page.route((url) => isApi(url, '/api/suggestions'), (route) =>
    route.request().method() === 'GET' && !new URL(route.request().url()).searchParams.has('action')
      ? route.fulfill(jsonBody({ items: [SUGGESTION] }))
      : route.fallback(),
  );

  await page.route((url) => isApi(url, '/api/votes'), (route) => {
    const request = route.request();
    // Shaped like api/votes.ts: a count for every id asked about, zeros
    // included, and a POST echoes the item with its new count and vote.
    if (request.method() === 'GET') {
      const ids = new URL(request.url()).searchParams.get('ids')?.split(',') ?? [];
      const counts = Object.fromEntries(ids.map((id) => [id, VOTE_COUNTS[id] ?? 0]));
      return route.fulfill(jsonBody({ counts, myVotes: [] }));
    }
    if (request.method() === 'POST') {
      const { itemId, vote } = request.postDataJSON() as { itemId: string; vote: 0 | 1 };
      return route.fulfill(jsonBody({ itemId, count: (VOTE_COUNTS[itemId] ?? 0) + vote, myVote: vote }));
    }
    return route.fallback();
  });

  await page.route((url) => isApi(url, '/api/chat'), (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: CHAT_ANSWER })
      : route.fallback(),
  );
}

export const test = base.extend<{ api: ApiStubs }>({
  api: [
    async ({ page, baseURL }, use) => {
      const unexpected: string[] = [];
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));
      await page.addInitScript((id) => {
        window.localStorage.setItem('wishlist:anonId', id);
      }, ANON_ID);
      await stubBackend(page, baseURL!, unexpected);

      await use({ unexpected });

      expect(unexpected, 'every /api call is stubbed').toEqual([]);
      expect(pageErrors, 'no uncaught errors in the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Resolves with the next POST the page sends to `path`; start it before the click that sends it. */
export function nextPost(page: Page, path: string): Promise<Request> {
  return page.waitForRequest((req) => req.method() === 'POST' && new URL(req.url()).pathname === path);
}
