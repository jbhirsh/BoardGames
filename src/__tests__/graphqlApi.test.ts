// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApi } from '../../api/_resolvers/index';
import { ApiError, guarded } from '../../api/_resolvers/errors';
import type { LookupResult } from '../../api/_lib/bgg';
import { eq } from 'drizzle-orm';
import { games, suggestions } from '../../api/_db/schema';
import { OWNER_COOKIE, refusing, testApi, type TestApi } from './helpers/api';
import { curated, pendingRow, seed } from './helpers/rows';

// What the API does around the resolvers: CSRF, the owner's session, the
// schema's enums, errors and time limits. Each operation's own rules are in
// votesApi, authApi, suggestionsApi and chatApi.

const OWNER = { cookie: OWNER_COOKIE };
const REMOVE = 'mutation { removeGame(id: "seti") }';

const apis: TestApi[] = [];
/** A test API whose database is closed after the test. */
const api$ = (...args: Parameters<typeof testApi>) => {
  const api = testApi(...args);
  apis.push(api);
  return api;
};
afterEach(async () => {
  await Promise.all(apis.splice(0).map((a) => a.close()));
});

/** The games and suggestions rows as they stand. */
const tables = async (api: TestApi) => ({
  games: await (await api.db()).select().from(games),
  suggestions: await (await api.db()).select().from(suggestions),
});

const WINGSPAN: LookupResult = {
  outcome: 'found',
  details: {
    bggId: 266192,
    name: 'Wingspan',
    year: 2019,
    min: 1,
    max: 5,
    mins: 70,
    desc: 'Birds.',
    kw: ['strategy'],
    categories: [],
    mechanics: [],
    section: 'strategy',
  },
};

describe('CSRF', () => {
  it.each([
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=x',
    'text/plain',
    'text/plain; x=application/json',
  ])('refuses a %s POST before reading it', async (contentType) => {
    const api = api$();
    await seed(await api.db(), { gameRows: [curated()] });
    const res = await api.fetch('/api/graphql', {
      method: 'POST',
      headers: { 'content-type': contentType, cookie: OWNER.cookie },
      body: `query=${encodeURIComponent(REMOVE)}`,
    });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ errors: [{ message: 'Requests must be sent as JSON' }] });
    expect(api.deps.ownerSession).not.toHaveBeenCalled();
    expect((await tables(api)).games[0].status).toBe('wanted');
  });

  it('never serves a mutation over GET', async () => {
    const api = api$();
    await seed(await api.db(), { gameRows: [curated()] });
    const res = await api.fetch(`/api/graphql?query=${encodeURIComponent(REMOVE)}`, {
      headers: { 'x-graphql-yoga-csrf': '1', cookie: OWNER.cookie },
    });
    expect(res.status).toBe(405);
    expect((await tables(api)).games[0].status).toBe('wanted');
  });

  it("answers a GET query only with Yoga's CSRF header", async () => {
    const api = testApi();
    const url = `/api/graphql?query=${encodeURIComponent('{ session { admin } }')}`;
    expect((await api.fetch(url)).status).toBe(403);
    const res = await api.fetch(url, { headers: { 'x-graphql-yoga-csrf': '1' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { session: { admin: false } } });
  });

  it('answers no CORS preflight, so no other site can send JSON with credentials', async () => {
    const res = await testApi().fetch('/api/graphql', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('serves no GraphiQL page', async () => {
    const res = await testApi().fetch('/api/graphql', { headers: { accept: 'text/html' } });
    expect(res.headers.get('content-type') ?? '').not.toContain('text/html');
  });

  it('looks a game up for the owner only as JSON, never over GET', async () => {
    const api = api$((d) => ({ suggestions: { ...d.suggestions, lookup: vi.fn(async () => WINGSPAN) } }));
    const res = await api.fetch(
      `/api/graphql?query=${encodeURIComponent('{ previewGame(game: "Wingspan") { outcome } }')}`,
      {
        headers: { 'x-graphql-yoga-csrf': '1', cookie: OWNER.cookie },
      },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ errors: [{ message: 'owner actions must be sent as JSON' }] });
    expect(api.deps.suggestions.lookup).not.toHaveBeenCalled();
  });
});

describe('limits on a request', () => {
  it('refuses 50 aliases before reading anything, and takes 15', async () => {
    const db = vi.fn(async () => {
      throw new Error('read');
    });
    const api = api$((d) => ({ db, suggestions: { ...d.suggestions, db } }));
    const many = (n: number, field: string) =>
      `{ ${Array.from({ length: n }, (_, i) => `a${i}: ${field}`).join(' ')} }`;
    const refused = await api.run(many(50, 'games { bgg { bggId } }'));
    // A validation error: GraphQL-over-HTTP answers it 200 to a plain JSON client.
    expect(refused.data).toBeNull();
    expect(refused.errors[0].message).toBe('A request may use at most 15 aliases');
    const sessions = await api.run(many(50, 'session { admin }'), {}, OWNER);
    expect(sessions.errors[0].message).toBe('A request may use at most 15 aliases');
    expect(db).not.toHaveBeenCalled();
    expect(api.deps.ownerSession).not.toHaveBeenCalled();
    expect((await api$().run(many(15, 'games { bgg { bggId } }'))).errors).toEqual([]);
  });

  it('refuses a document nested too deep, or too long', async () => {
    const api = testApi();
    const deep = await api.run(
      '{ __type(name: "Query") { fields { type { ofType { ofType { ofType { ofType { name } } } } } } } }',
    );
    expect(deep.errors[0].message).toBe('A request may nest at most 6 levels');
    const long = await api.run(`{ session { ${'admin '.repeat(1000)} } }`);
    expect(long.errors[0].message).toMatch(/more than 1000 tokens/);
    expect((await api.run('{ __type(name: "Query") { fields { type { name } } } }')).errors).toEqual([]);
  });

  it('runs no subscription over GET, so a link can never ask Gemini', async () => {
    const stream = vi.fn(async () => (async function* () {})());
    const api = testApi((d) => ({ chat: { ...d.chat, streamRulesAnswer: stream } }));
    const query = encodeURIComponent('subscription { askRules(slug: "catan", message: "hi") }');
    const res = await api.fetch(`/api/graphql?query=${query}`, {
      headers: { 'x-graphql-yoga-csrf': '1', accept: 'text/event-stream' },
    });
    expect(await res.text()).toContain('Can only perform a subscription operation from a POST request.');
    expect(stream).not.toHaveBeenCalled();
  });

  it('can turn introspection off, as production does', async () => {
    const yoga = createApi(() => testApi().deps, { production: true });
    const res = await yoga.fetch('https://games.example/api/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ __schema { types { name } } }' }),
    });
    expect(await res.text()).toMatch(/GraphQL introspection has been disabled/);
  });
});

describe('the games query', () => {
  it('answers anyone over GET with the CSRF header, the same whether or not the owner is signed in', async () => {
    const api = api$();
    await seed(await api.db(), { gameRows: [curated(), curated({ id: 'gone', name: 'Gone', status: 'removed' })] });
    const url = `/api/graphql?query=${encodeURIComponent('query Games { games { wishlist { id source } } }')}`;
    const asked: Array<Record<string, string>> = [{}, { cookie: OWNER.cookie }];
    const answers = await Promise.all(
      asked.map(async (headers: Record<string, string>) => {
        const res = await api.fetch(url, { headers: { 'x-graphql-yoga-csrf': '1', ...headers } });
        return res.json() as Promise<unknown>;
      }),
    );
    expect(answers[0]).toEqual({ data: { games: { wishlist: [{ id: 'seti', source: 'CURATED' }] } } });
    expect(answers[1]).toEqual(answers[0]);
    expect(api.deps.ownerSession).not.toHaveBeenCalled();
    // Kept by the service worker alone, never a CDN or the browser's cache.
    const res = await api.fetch(url, { headers: { 'x-graphql-yoga-csrf': '1' } });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it("still answers an older client's asin, as null, though its column is gone", async () => {
    const api = api$();
    await seed(await api.db(), { gameRows: [curated()] });
    const { data, errors } = await api.run('query Games { games { wishlist { id asin } } }');
    expect(errors).toEqual([]);
    expect(data).toEqual({ games: { wishlist: [{ id: 'seti', asin: null }] } });
  });
});

describe("the owner's operations", () => {
  const OWNER_ONLY: Array<[string, string]> = [
    ['pendingSuggestions', '{ pendingSuggestions { id } }'],
    ['previewGame', '{ previewGame(game: "Wingspan") { outcome } }'],
    ['emailedSuggestion', '{ emailedSuggestion(id: "sug-aaaaaa") { suggestion { game } } }'],
    ['addGame', 'mutation { addGame(game: "Cascadia", name: "Jess") { item { id } } }'],
    ['editGame', 'mutation { editGame(id: "seti", game: "Azul") { id } }'],
    ['removeGame', 'mutation { removeGame(id: "seti") }'],
    ['decideSuggestion', 'mutation { decideSuggestion(id: "sug-aaaaaa", decision: DENY) { item { id } } }'],
  ];

  it.each(OWNER_ONLY)('refuses %s without a live session, changing nothing', async (_name, query) => {
    const api = api$();
    await seed(await api.db(), { gameRows: [curated()], suggestionRows: [pendingRow()] });
    const before = await tables(api);
    for (const init of [{}, { cookie: 'better-auth.session_token=someone-else' }]) {
      const res = await api.run(query, {}, init);
      expect(res.status).toBe(403);
      expect(res.errors[0]).toMatchObject({ message: 'owner sign-in required', extensions: { code: 'FORBIDDEN' } });
    }
    expect(await tables(api)).toEqual(before);
  });

  it('refuses a token argument, which the emailed links no longer carry', async () => {
    const api = api$();
    const res = await api.run(
      'mutation { decideSuggestion(id: "sug-aaaaaa", token: "x", decision: APPROVE) { lookup } }',
      {},
      OWNER,
    );
    expect(res.errors[0].message).toMatch(/Unknown argument "token"/);
  });

  it('asks the owner check once a request, and sends the cookie it renewed with the answer', async () => {
    const RENEWED =
      '__Secure-better-auth.session_token=renewed; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax';
    const ownerSession = vi.fn(async () => ({ owner: true, setCookies: [RENEWED] }));
    const api = api$(() => ({ ownerSession }));
    const res = await api.run('{ a: session { admin } b: session { admin } pendingSuggestions { id } }', {}, OWNER);
    expect(res.data).toEqual({ a: { admin: true }, b: { admin: true }, pendingSuggestions: [] });
    expect(ownerSession).toHaveBeenCalledTimes(1);
    expect(ownerSession).toHaveBeenCalledWith(expect.objectContaining({ cookie: OWNER_COOKIE }));
    expect(res.headers.getSetCookie()).toEqual([RENEWED]);

    // A request that never asks sends no cookie.
    const votes = await api.run('{ wishlistVotes(ids: ["azul"]) { myVotes } }', {}, OWNER);
    expect(votes.headers.getSetCookie()).toEqual([]);
    expect(ownerSession).toHaveBeenCalledTimes(1);
  });

  it('works the queue with a session: lists, previews, approves, edits and removes', async () => {
    const lookup = vi.fn(async () => WINGSPAN);
    const api = api$((d) => ({ suggestions: { ...d.suggestions, lookup } }));
    await seed(await api.db(), { suggestionRows: [pendingRow()] });
    const queue = await api.run('{ pendingSuggestions { id game status } }', {}, OWNER);
    expect(queue.data).toEqual({ pendingSuggestions: [{ id: 'sug-aaaaaa', game: 'Wingspan', status: 'PENDING' }] });
    const preview = await api.run('{ previewGame(game: "Wingspan") { outcome details { name section } } }', {}, OWNER);
    expect(preview.data).toEqual({
      previewGame: { outcome: 'FOUND', details: { name: 'Wingspan', section: 'strategy' } },
    });
    const approved = await api.run(
      'mutation { decideSuggestion(id: "sug-aaaaaa", decision: APPROVE) { item { status } lookup } }',
      {},
      OWNER,
    );
    expect(approved.data).toEqual({ decideSuggestion: { item: { status: 'APPROVED' }, lookup: 'FOUND' } });
    const edited = await api.run(
      'mutation { editGame(id: "sug-aaaaaa", game: "Wingspan (2nd)", details: { min: 2 }) { name minPlayers } }',
      {},
      OWNER,
    );
    expect(edited.data).toEqual({ editGame: { name: 'Wingspan (2nd)', minPlayers: 2 } });
    expect((await api.run('mutation { removeGame(id: "sug-aaaaaa") }', {}, OWNER)).data).toEqual({ removeGame: true });
    const after = await tables(api);
    expect(after.games[0].status).toBe('removed');
    expect(after.suggestions[0].status).toBe('removed');
  });

  it('adds a game, telling apart details left out (look it up) and null (none)', async () => {
    const lookup = vi.fn(async () => WINGSPAN);
    const ids = ['sug-111111', 'sug-222222'];
    const api = api$((d) => ({ suggestions: { ...d.suggestions, lookup, randomId: () => ids.shift()! } }));
    await api.run('mutation { addGame(game: "Wingspan", name: "Jess") { lookup } }', {}, OWNER);
    await api.run('mutation { addGame(game: "Azul", name: "Jess", details: null) { lookup } }', {}, OWNER);
    expect(lookup).toHaveBeenCalledTimes(1);
    const { games: rows } = await tables(api);
    expect(rows.map((g) => [g.name, g.bggId, g.section])).toEqual([
      ['Wingspan', 266192, 'strategy'],
      ['Azul', null, null],
    ]);
  });
});

describe('the emailed approve and deny links', () => {
  const EMAILED = `query EmailedSuggestion($id: String!, $game: String) {
    emailedSuggestion(id: $id) { suggestion { game status } preview(game: $game) { outcome } }
  }`;

  it('reads the suggestion and what BoardGameGeek has for the owner, over GET too, writing nothing', async () => {
    const lookup = vi.fn(async () => WINGSPAN);
    const api = api$((d) => ({ suggestions: { ...d.suggestions, lookup } }));
    await seed(await api.db(), { suggestionRows: [pendingRow()] });
    const res = await api.run(EMAILED, { id: 'sug-aaaaaa' }, OWNER);
    expect(res.data).toEqual({
      emailedSuggestion: { suggestion: { game: 'Wingspan', status: 'PENDING' }, preview: { outcome: 'FOUND' } },
    });
    const url = `/api/graphql?query=${encodeURIComponent(EMAILED)}&variables=${encodeURIComponent('{"id":"sug-aaaaaa"}')}`;
    const got = await api.fetch(url, { headers: { 'x-graphql-yoga-csrf': '1', cookie: OWNER.cookie } });
    expect(got.status).toBe(200);
    expect((await tables(api)).suggestions[0].status).toBe('pending');
  });

  it('looks nothing up for a decided suggestion', async () => {
    const lookup = vi.fn(async () => WINGSPAN);
    const api = api$((d) => ({ suggestions: { ...d.suggestions, lookup } }));
    await seed(await api.db(), { suggestionRows: [pendingRow({ status: 'denied', decidedAt: 10 })] });
    const res = await api.run(EMAILED, { id: 'sug-aaaaaa' }, OWNER);
    expect(res.data).toEqual({
      emailedSuggestion: { suggestion: { game: 'Wingspan', status: 'DENIED' }, preview: null },
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('refuses a mistyped link and a bad corrected name', async () => {
    const api = api$();
    await seed(await api.db(), { suggestionRows: [pendingRow()] });
    expect((await api.run(EMAILED, { id: 'nope' }, OWNER)).errors[0].extensions?.code).toBe('BAD_REQUEST');
    expect((await api.run(EMAILED, { id: 'sug-zzzzzz' }, OWNER)).errors[0].extensions?.code).toBe('NOT_FOUND');
    const bad = await api.run(EMAILED, { id: 'sug-aaaaaa', game: 'x' }, OWNER);
    expect(bad.errors[0].extensions?.code).toBe('BAD_NAME');
  });
});

describe('suggestGame', () => {
  it('is public, and limited per IP before anything is stored', async () => {
    const SUGGEST = 'mutation { suggestGame(game: "Cascadia", name: "Sam", note: "Calm") { id status source } }';
    const api = api$();
    expect((await api.run(SUGGEST)).data).toEqual({
      suggestGame: { id: 'sug-bbbbbb', status: 'PENDING', source: 'FRIEND' },
    });
    const limited = api$((d) => ({ limiters: { ...d.limiters, suggest: refusing() } }));
    expect((await limited.run(SUGGEST)).status).toBe(429);
    expect((await tables(limited)).suggestions).toEqual([]);
    expect(limited.sent).toHaveLength(0);
  });

  it('answers 500, reported under its label, when the email fails, and keeps it as unsent', async () => {
    const api = api$((d) => ({
      suggestions: {
        ...d.suggestions,
        mailer: {
          send: async () => {
            throw new Error('resend down');
          },
        },
      },
    }));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await api.run('mutation { suggestGame(game: "Cascadia", name: "Sam") { id } }');
    expect(res.status).toBe(500);
    expect(res.errors[0]).toMatchObject({ message: 'Server error', extensions: { code: 'INTERNAL_SERVER_ERROR' } });
    expect(errSpy).toHaveBeenCalledWith('suggestions api error:', expect.any(Error));
    errSpy.mockRestore();
    const [row] = await (await api.db()).select().from(suggestions).where(eq(suggestions.id, 'sug-bbbbbb'));
    expect(row.status).toBe('unsent');
  });
});

describe('the server', () => {
  it('answers 500 without the cause when its dependencies cannot be built', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const yoga = createApi(() => {
      throw new Error('no database configured: set TURSO_DATABASE_URL');
    });
    const res = await yoga.fetch('https://games.example/api/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ session { admin } }' }),
    });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('TURSO_DATABASE_URL');
    errSpy.mockRestore();
  });
});

describe('guarded', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes an answer and an ApiError through', async () => {
    expect(await guarded('x', 1000, async () => 42)).toBe(42);
    await expect(guarded('x', 1000, async () => Promise.reject(new ApiError(409, 'taken')))).rejects.toMatchObject({
      status: 409,
      message: 'taken',
      extensions: { code: 'CONFLICT', http: { status: 409 } },
    });
  });

  it('answers 504, reported, once the time limit passes', async () => {
    vi.useFakeTimers();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const late = guarded('votes api error:', 10_000, () => new Promise<never>(() => {}));
    const settled = late.catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await settled).toMatchObject({ status: 504, extensions: { code: 'TIMEOUT' } });
    expect(errSpy).toHaveBeenCalledWith('votes api error: timed out', expect.any(ApiError));
    errSpy.mockRestore();
  });

  it('names an unknown status a server error', () => {
    expect(new ApiError(418, 'teapot').extensions.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
