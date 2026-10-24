import { test as base, expect, type Page, type Request, type Route } from '@playwright/test';

/**
 * Shared setup for every spec: the page runs against deterministic stubs for
 * the API, and nothing it requests leaves the machine. The API is GraphQL at
 * /api/graphql (api/graphql.ts), so its stubs answer by operation name
 * (stubOperation); an operation nothing stubs fails the test, as does any
 * other /api call. Specs import `test` and `expect` from here, not from
 * '@playwright/test'.
 */

/** The anonymous voter id the page finds in localStorage, so vote bodies are exact. */
export const ANON_ID = 'e2e-anon-00000001';

/** One approved friend suggestion, as Query.suggestions answers it. */
export const SUGGESTION = {
  id: 'sug-0e2e0e2e0e2e',
  game: 'Fixture Quest',
  name: 'Robin',
  note: 'We loved it at game night',
  source: 'FRIEND',
  details: {
    year: null,
    min: 2,
    max: 4,
    mins: 30,
    desc: 'A made-up game for the end-to-end tests.',
    kw: ['strategy'],
    type: null,
    img: null,
  },
} as const;

/** Stored vote counts; wishlistVotes reports 0 for every other id it is asked about. */
const VOTE_COUNTS: Record<string, number> = { splendor: 3, [SUGGESTION.id]: 1 };

/** The rules assistant's stubbed reply, in Markdown as the model writes it. */
export const CHAT_ANSWER = 'Yes. **Every player** answers each question, then you vote.';

interface ApiStubs {
  /** `/api/*` requests and GraphQL operations no stub claims; the test fails if any were made. */
  unexpected: string[];
}

/** An operation the page sent: its name and variables. */
export interface Operation {
  operationName: string;
  variables: Record<string, unknown>;
}

/** The GraphQL operation a request carries, or null for anything else. */
export function operationOf(request: Request): Operation | null {
  if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/graphql') return null;
  const body: unknown = request.postDataJSON();
  if (typeof body !== 'object' || body === null || !('operationName' in body)) return null;
  const { operationName, variables }: { operationName?: unknown; variables?: unknown } = body;
  if (typeof operationName !== 'string') return null;
  return {
    operationName,
    variables: typeof variables === 'object' && variables !== null ? { ...variables } : {},
  };
}

/** A whole reply rather than `data`: GraphQL errors, another status, or a body of the stub's own. */
class Reply {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
  constructor(status: number, body: string, contentType = 'application/json') {
    this.status = status;
    this.body = body;
    this.contentType = contentType;
  }
}

const sse = (data: unknown) => `event: next\ndata: ${JSON.stringify(data)}\n\n`;
const COMPLETE = 'event: complete\ndata:\n\n';

/** The rules assistant's answer as the API streams it: one server-sent event per chunk, then complete. */
export const answerStream = (...chunks: string[]) =>
  new Reply(200, chunks.map((text) => sse({ data: { askRules: text } })).join('') + COMPLETE, 'text/event-stream');

/** A refused question as the API streams it: its status and one event carrying the error. */
export const streamRefusal = (status: number, code: string, message: string) =>
  new Reply(status, sse({ errors: [{ message, extensions: { code } }] }) + COMPLETE, 'text/event-stream');

/** Answers with the operation's `data`, or with a whole Reply. */
async function answer(route: Route, out: unknown): Promise<void> {
  if (out instanceof Reply) return route.fulfill({ status: out.status, contentType: out.contentType, body: out.body });
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: out }) });
}

/**
 * Answers one GraphQL operation, by name, with `stub` (given its variables);
 * every other request passes on to the routes registered before it. A spec's
 * stubs go in after the fixture's, so Playwright tries them first.
 */
export async function stubOperation(
  page: Page,
  name: string,
  stub: (variables: Record<string, unknown>) => unknown,
): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/graphql',
    (route) => {
      const op = operationOf(route.request());
      return op?.operationName === name ? answer(route, stub(op.variables)) : route.fallback();
    },
  );
}

async function stubBackend(page: Page, baseURL: string, unexpected: string[]): Promise<void> {
  const origin = new URL(baseURL).origin;
  const isApi = (url: URL, path: string) => url.origin === origin && url.pathname === path;

  // Playwright tries routes newest first, so this catch-all goes in first and
  // every stub below takes precedence over it. Anything off this origin (a
  // missed stub, the dictionary when a spec doesn't stub it) is aborted
  // rather than reaching the network.
  await page.route(
    (url) => url.origin !== origin,
    (route) => route.abort('blockedbyclient'),
  );

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

  // A GraphQL operation none of the stubs below answers: recorded by name.
  await page.route(
    (url) => isApi(url, '/api/graphql'),
    (route) => {
      const op = operationOf(route.request());
      unexpected.push(op ? `operation ${op.operationName}` : `${route.request().method()} ${route.request().url()}`);
      return route.fulfill({ status: 501, body: 'not stubbed' });
    },
  );

  await stubOperation(page, 'Session', () => ({ session: { admin: false } }));
  await stubOperation(page, 'Suggestions', () => ({ suggestions: [SUGGESTION] }));
  // A count for every id asked about, zeros included; a vote answers the
  // entry's new count.
  await stubOperation(page, 'WishlistVotes', ({ ids }) => ({
    wishlistVotes: {
      counts: (Array.isArray(ids) ? ids : []).map((id: unknown) => ({ id, count: VOTE_COUNTS[String(id)] ?? 0 })),
      myVotes: [],
    },
  }));
  await stubOperation(page, 'Vote', ({ itemId, vote }) => ({
    vote: { count: (VOTE_COUNTS[String(itemId)] ?? 0) + Number(vote) },
  }));

  await stubOperation(page, 'AskRules', () => answerStream(CHAT_ANSWER));
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

      expect(unexpected, 'every /api call and operation is stubbed').toEqual([]);
      expect(pageErrors, 'no uncaught errors in the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Resolves with the variables of the next `name` operation the page sends; start it before the click that sends it. */
export async function nextOperation(page: Page, name: string): Promise<Record<string, unknown>> {
  const request = await page.waitForRequest((req) => operationOf(req)?.operationName === name);
  return operationOf(request)?.variables ?? {};
}
