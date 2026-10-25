import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Page, Route } from '@playwright/test';
import setup, { LIVE, LIVE_READS, operation, stubApi } from './gif-setup.ts';

const ORIGIN = 'http://127.0.0.1:4192';

// The routes stubApi adds, in order, for the newest-first lookup Playwright does.
async function routes(fixtures: boolean) {
  const added: [(url: URL) => boolean, (route: Route) => Promise<void> | void][] = [];
  const page = {
    route: vi.fn((match: (url: URL) => boolean, handler: (route: Route) => Promise<void> | void) => {
      added.push([match, handler]);
      return Promise.resolve();
    }),
  };
  await stubApi(page as unknown as Pick<Page, 'route'>, ORIGIN, fixtures);
  // As Playwright tries them: the newest first, falling back to older ones.
  return async (url: string, request: Partial<FakeRequest> = {}, fetched?: unknown) => {
    const r = fakeRoute(url, request, fetched);
    for (const [match, handler] of [...added].reverse()) {
      if (!match(new URL(url))) continue;
      r.fellBack = false;
      await handler(r as unknown as Route);
      if (!r.fellBack) break;
    }
    return r;
  };
}

interface FakeRequest {
  method: string;
  body: unknown;
  resourceType: string;
}

function fakeRoute(url: string, request: Partial<FakeRequest>, fetched?: unknown) {
  const r = {
    fellBack: false,
    request: () => ({
      url: () => url,
      method: () => request.method ?? 'POST',
      postDataJSON: () => request.body ?? null,
      resourceType: () => request.resourceType ?? 'fetch',
    }),
    fulfill: vi.fn(() => Promise.resolve()),
    abort: vi.fn(() => Promise.resolve()),
    fallback: vi.fn(() => {
      r.fellBack = true;
      return Promise.resolve();
    }),
    fetch: vi.fn(() => (fetched instanceof Error ? Promise.reject(fetched) : Promise.resolve(fetched))),
  };
  return r;
}

const op = (operationName: string, variables?: unknown) => ({ body: { operationName, variables } });
const body = (r: ReturnType<typeof fakeRoute>) =>
  JSON.parse((r.fulfill.mock.calls[0] as unknown as [{ body: string }])[0].body) as unknown;

afterEach(() => vi.restoreAllMocks());

describe('operation', () => {
  const request = (method: string, body: unknown) => ({ method: () => method, postDataJSON: () => body });

  it('names a POSTed operation and its variables', () => {
    expect(operation(request('POST', { operationName: 'Session' }))).toEqual({ name: 'Session', variables: {} });
    expect(operation(request('POST', { operationName: 'A', variables: { ids: [1] } }))).toEqual({
      name: 'A',
      variables: { ids: [1] },
    });
  });

  it('names nothing else', () => {
    expect(operation(request('GET', { operationName: 'A' }))).toBeNull();
    expect(operation(request('POST', null))).toBeNull();
    expect(operation(request('POST', { query: '{ a }' }))).toBeNull();
    expect(operation(request('POST', { operationName: 3 }))).toBeNull();
  });
});

describe('stubApi', () => {
  it('lets only pictures through from elsewhere, fetched from Node, and none with fixtures', async () => {
    const live = await routes(false);
    const picture = { ok: true };
    const art = await live('https://cf.geekdo-images.com/a.jpg', { resourceType: 'image' }, picture);
    expect(art.fulfill).toHaveBeenCalledWith({ response: picture });
    const broken = await live('https://cf.geekdo-images.com/b.jpg', { resourceType: 'image' }, new Error('x'));
    expect(broken.abort).toHaveBeenCalledWith('failed');
    const script = await live('https://example.com/a.js', { resourceType: 'script' });
    expect(script.abort).toHaveBeenCalledWith('blockedbyclient');
    const fixed = await routes(true);
    expect((await fixed('https://cf.geekdo-images.com/a.jpg', { resourceType: 'image' })).abort).toHaveBeenCalled();
  });

  it('answers as signed out, with nothing on the wishlist, and refuses the rest of the API', async () => {
    const stub = await routes(true);
    expect(body(await stub(`${ORIGIN}/api/graphql`, op('Session')))).toEqual({ data: { session: { admin: false } } });
    expect(body(await stub(`${ORIGIN}/api/graphql`, op('Suggestions')))).toEqual({ data: { suggestions: [] } });
    expect(body(await stub(`${ORIGIN}/api/graphql`, op('WishlistVotes', { ids: ['a', 'b'] })))).toEqual({
      data: {
        wishlistVotes: {
          counts: [
            { id: 'a', count: 0 },
            { id: 'b', count: 0 },
          ],
          myVotes: [],
        },
      },
    });
    expect(body(await stub(`${ORIGIN}/api/graphql`, op('WishlistVotes')))).toEqual({
      data: { wishlistVotes: { counts: [], myVotes: [] } },
    });
    expect((await stub(`${ORIGIN}/api/graphql`, op('Vote'))).fulfill).toHaveBeenCalledWith({ status: 501 });
    expect((await stub(`${ORIGIN}/api/other`)).fulfill).toHaveBeenCalledWith({ status: 501 });
    expect((await stub(`${ORIGIN}/_vercel/insights/script.js`)).fulfill).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200, body: '' }),
    );
  });

  it("reads the wishlist from the live site, falling back to the stub's, saying so once", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const live = await routes(false);
    expect([...LIVE_READS]).toEqual(['Suggestions', 'WishlistVotes']);
    const answer = { ok: () => true };
    const read = await live(`${ORIGIN}/api/graphql`, op('Suggestions'), answer);
    expect(read.fetch).toHaveBeenCalledWith({ url: `${LIVE}/api/graphql` });
    expect(read.fulfill).toHaveBeenCalledWith({ response: answer });
    const refused = await live(`${ORIGIN}/api/graphql`, op('Suggestions'), { ok: () => false });
    expect(body(refused)).toEqual({ data: { suggestions: [] } });
    await live(`${ORIGIN}/api/graphql`, op('WishlistVotes'), new Error('offline'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      `pr-gif: ${LIVE} didn't answer Suggestions, so this recording shows the stub's empty wishlist`,
    );
    const session = await live(`${ORIGIN}/api/graphql`, op('Session'));
    expect(session.fetch).not.toHaveBeenCalled();
  });
});

describe('the setup module', () => {
  it('adds --fixtures, and stubs the API before the scenario does', async () => {
    expect(setup.options).toEqual({ fixtures: { type: 'boolean' } });
    const page = { route: vi.fn(() => Promise.resolve()) };
    const ctx = { side: 'after' as const, origin: ORIGIN, root: '/app' };
    await setup.beforeSetup(page as unknown as Page, { ...ctx, options: { fixtures: true } });
    expect(page.route).toHaveBeenCalledTimes(4);
    await setup.beforeSetup(page as unknown as Page, { ...ctx, options: {} });
    expect(page.route).toHaveBeenCalledTimes(9);
  });
});
