// What every PR GIF of this app needs around its scenario (the `gif.setup`
// setting in .github/ci.json; jbhirsh/ci's gif/cli.mjs calls it): the page
// looks as it does on the live site. The wishlist and its votes are the live
// site's (LIVE, read with GETs only), the BoardGameGeek art is loaded, and
// nothing is sent to it: any other API call is stubbed (not signed in; a
// POST is refused unless the scenario's setup routes it). --fixtures stubs
// the reads too, with nothing on the wishlist, for a recording that can't
// change with the live data.
import type { Page, Request, Route } from '@playwright/test';
import type { Setup } from './gif-types.ts';

/** The live site, whose wishlist and votes the recordings show (smoke.yml's TARGET_URL). */
export const LIVE = 'https://board-games-silk.vercel.app';

/** The reads a recording takes from the live site: the wishlist's suggestions and vote counts. */
export const LIVE_READS = new Set(['Suggestions', 'WishlistVotes']);

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

/** The GraphQL operation a request to /api/graphql names, and its variables. */
export function operation(request: Pick<Request, 'method' | 'postDataJSON'>): {
  name: string;
  variables: Record<string, unknown>;
} | null {
  const body: unknown = request.method() === 'POST' ? request.postDataJSON() : null;
  if (typeof body !== 'object' || body === null || !('operationName' in body)) return null;
  const { operationName, variables }: { operationName?: unknown; variables?: unknown } = body;
  if (typeof operationName !== 'string') return null;
  return {
    name: operationName,
    variables: typeof variables === 'object' && variables !== null ? { ...variables } : {},
  };
}

type Routes = Pick<Page, 'route'>;
type Handler = (route: Route) => Promise<void> | void;

/**
 * The app's API (GraphQL at /api/graphql, answered by operation name).
 * Playwright tries the newest route first, so these go in before the
 * scenario's setup, whose own routes then win.
 *   - Off this origin, only pictures load (the BoardGameGeek art), unless
 *     `fixtures`; anything else is aborted. They're fetched from Node rather
 *     than by the browser: BoardGameGeek's image server answers headless
 *     Chromium with a 400, where it serves Node the same request, and a
 *     blank box isn't what the page shows.
 *   - The wishlist and its vote counts are read from the live site, unless
 *     `fixtures` (or the live site can't be reached, which it warns of):
 *     then nothing is on the wishlist and every count is 0.
 *   - Not signed in. Any other operation (a vote, a suggestion) is refused.
 */
export async function stubApi(page: Routes, origin: string, fixtures: boolean, live = LIVE): Promise<void> {
  const api = (url: URL) => url.origin === origin && url.pathname === '/api/graphql';
  const route = (match: (url: URL) => boolean, handler: Handler) => page.route(match, handler);
  await route(
    (url) => url.origin !== origin,
    async (r) => {
      if (fixtures || r.request().resourceType() !== 'image') return r.abort('blockedbyclient');
      try {
        return await r.fulfill({ response: await r.fetch() });
      } catch {
        return r.abort('failed');
      }
    },
  );
  await route(
    (url) => url.origin === origin && url.pathname.startsWith('/api/'),
    (r) => r.fulfill({ status: 501 }),
  );
  await route(
    (url) => url.origin === origin && url.pathname.startsWith('/_vercel/'),
    (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  await route(api, (r) => {
    const op = operation(r.request());
    if (op?.name === 'Session') return r.fulfill(json({ data: { session: { admin: false } } }));
    if (op?.name === 'Suggestions') return r.fulfill(json({ data: { suggestions: [] } }));
    if (op?.name === 'WishlistVotes') {
      const ids = Array.isArray(op.variables.ids) ? op.variables.ids : [];
      return r.fulfill(
        json({ data: { wishlistVotes: { counts: ids.map((id: unknown) => ({ id, count: 0 })), myVotes: [] } } }),
      );
    }
    return r.fallback();
  });
  if (fixtures) return;
  let warned = false;
  await route(api, async (r) => {
    const op = operation(r.request());
    if (!op || !LIVE_READS.has(op.name)) return r.fallback();
    try {
      const response = await r.fetch({ url: `${live}/api/graphql` });
      if (response.ok()) return await r.fulfill({ response });
    } catch {
      // Out of reach: the stub's empty answer.
    }
    // Said once, so a recording that isn't of the live data is never taken for it.
    if (!warned)
      console.warn(`pr-gif: ${live} didn't answer ${op.name}, so this recording shows the stub's empty wishlist`);
    warned = true;
    return r.fallback();
  });
}

export default {
  options: { fixtures: { type: 'boolean' } },
  async beforeSetup(page, { origin, options }) {
    await stubApi(page, origin, options.fixtures === true);
  },
} satisfies Setup;
