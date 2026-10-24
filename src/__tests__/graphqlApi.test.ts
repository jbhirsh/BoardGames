// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApi } from '../../api/_resolvers/index';
import { ApiError, guarded } from '../../api/_resolvers/errors';
import type { LookupResult } from '../../api/_lib/bgg';
import { refusing, testApi } from './helpers/api';

// What the API does around the resolvers: CSRF, the owner's session, the
// schema's enums, errors and time limits. Each operation's own rules are in
// votesApi, authApi, suggestionsApi and chatApi.

const SID = 'test-session-' + 'b'.repeat(20);
const TOKEN = 'test-token-' + 'a'.repeat(21);
const OWNER = { cookie: `gr_session=${SID}` };

function ownerApi(over?: Parameters<typeof testApi>[0]) {
  const api = testApi(over);
  api.redis.strings[`auth:session:${SID}`] = '1';
  return api;
}

const pending = {
  id: 'sug-aaaaaa',
  game: 'Wingspan',
  name: 'Alex',
  note: '',
  status: 'pending',
  createdAt: 1000,
  token: TOKEN,
};

const WINGSPAN: LookupResult = {
  outcome: 'found',
  details: { bggId: 266192, name: 'Wingspan', year: 2019, min: 1, max: 5, mins: 70, desc: 'Birds.', kw: ['strategy'] },
};

describe('CSRF', () => {
  it.each([
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=x',
    'text/plain',
    'text/plain; x=application/json',
  ])('refuses a %s POST before reading it', async (contentType) => {
    const api = ownerApi();
    const res = await api.fetch('/api/graphql', {
      method: 'POST',
      headers: { 'content-type': contentType, cookie: OWNER.cookie },
      body: 'query=mutation%20%7B%20logout%20%7D',
    });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ errors: [{ message: 'Requests must be sent as JSON' }] });
    expect(api.redis.strings[`auth:session:${SID}`]).toBe('1');
  });

  it('never serves a mutation over GET', async () => {
    const api = ownerApi();
    const res = await api.fetch(`/api/graphql?query=${encodeURIComponent('mutation { logout }')}`, {
      headers: { 'x-graphql-yoga-csrf': '1', cookie: OWNER.cookie },
    });
    expect(res.status).toBe(405);
    expect(api.redis.strings[`auth:session:${SID}`]).toBe('1');
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
    const api = ownerApi((d) => ({ suggestions: { ...d.suggestions, lookup: vi.fn(async () => WINGSPAN) } }));
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
  it('refuses 50 aliases before any Redis call, and takes 15', async () => {
    const api = testApi();
    const many = (n: number, field: string) =>
      `{ ${Array.from({ length: n }, (_, i) => `a${i}: ${field}`).join(' ')} }`;
    const refused = await api.run(many(50, 'suggestions { id }'));
    // A validation error: GraphQL-over-HTTP answers it 200 to a plain JSON client.
    expect(refused.data).toBeNull();
    expect(refused.errors[0].message).toBe('A request may use at most 15 aliases');
    const links = await api.run(many(50, `signInLinkLive(token: "${TOKEN}")`));
    expect(links.errors[0].message).toBe('A request may use at most 15 aliases');
    expect(api.rawRedis.lrange).not.toHaveBeenCalled();
    expect(api.redis.get).not.toHaveBeenCalled();
    expect((await api.run(many(15, 'suggestions { id }'))).errors).toEqual([]);
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

describe("the owner's operations", () => {
  const OWNER_ONLY: Array<[string, string]> = [
    ['pendingSuggestions', '{ pendingSuggestions { id } }'],
    ['previewGame', '{ previewGame(game: "Wingspan") { outcome } }'],
    ['addGame', 'mutation { addGame(game: "Cascadia", name: "Jess") { item { id } } }'],
    ['editSuggestion', 'mutation { editSuggestion(id: "sug-aaaaaa", game: "Azul") { id } }'],
    ['removeSuggestion', 'mutation { removeSuggestion(id: "sug-aaaaaa") }'],
    ['decideSuggestion', 'mutation { decideSuggestion(id: "sug-aaaaaa", decision: DENY) { item { id } } }'],
  ];

  it.each(OWNER_ONLY)('refuses %s without a live session, changing nothing', async (_name, query) => {
    const api = testApi();
    api.rawRedis.hashes['suggestions:sug-aaaaaa'] = { ...pending, status: 'approved' };
    for (const init of [{}, { cookie: 'gr_session=' + 'c'.repeat(24) }]) {
      const res = await api.run(query, {}, init);
      expect(res.status).toBe(403);
      expect(res.errors[0]).toMatchObject({ message: 'owner sign-in required', extensions: { code: 'FORBIDDEN' } });
    }
    expect(api.rawRedis.hset).not.toHaveBeenCalled();
    expect(api.rawRedis.multi).not.toHaveBeenCalled();
  });

  it('works the queue with a session: lists, previews, approves, edits and removes', async () => {
    const lookup = vi.fn(async (): Promise<LookupResult> => ({ outcome: 'no-match' }));
    const api = ownerApi((d) => ({ suggestions: { ...d.suggestions, lookup } }));
    api.rawRedis.hashes['suggestions:sug-aaaaaa'] = pending;
    api.rawRedis.lists['suggestions:active'] = ['sug-aaaaaa'];

    const queue = await api.run('{ pendingSuggestions { id game status source } }', {}, OWNER);
    expect(queue.data).toEqual({
      pendingSuggestions: [{ id: 'sug-aaaaaa', game: 'Wingspan', status: 'PENDING', source: 'FRIEND' }],
    });

    const looked = await api.run('{ previewGame(game: "Wingspan") { outcome details { name } } }', {}, OWNER);
    expect(looked.data).toEqual({ previewGame: { outcome: 'NO_MATCH', details: null } });

    const decided = await api.run(
      'mutation ($details: DetailsInput) { decideSuggestion(id: "sug-aaaaaa", decision: APPROVE, details: $details) { item { status decidedAt details { min } } lookup } }',
      { details: { bggId: 1, min: 2, max: 4, mins: 30, desc: '', kw: ['strategy'] } },
      OWNER,
    );
    expect(decided.data).toEqual({
      decideSuggestion: { item: { status: 'APPROVED', decidedAt: 5000, details: { min: 2 } }, lookup: null },
    });

    const edited = await api.run(
      'mutation { editSuggestion(id: "sug-aaaaaa", note: "Birds!", details: { type: "heavy" }) { note details { type } } }',
      {},
      OWNER,
    );
    expect(edited.data).toEqual({ editSuggestion: { note: 'Birds!', details: { type: 'heavy' } } });

    const again = await api.run(
      'mutation { decideSuggestion(id: "sug-aaaaaa", decision: DENY) { item { id } } }',
      {},
      OWNER,
    );
    expect(again.status).toBe(409);
    expect(again.errors[0]).toMatchObject({
      message: 'Wingspan was already approved',
      extensions: { code: 'ALREADY_DECIDED', status: 'approved' },
    });

    expect((await api.run('mutation { removeSuggestion(id: "sug-aaaaaa") }', {}, OWNER)).data).toEqual({
      removeSuggestion: true,
    });
    expect((await api.run('{ suggestions { id } }')).data).toEqual({ suggestions: [] });
  });

  it('adds a game, telling apart details left out (look it up) and null (none)', async () => {
    const lookup = vi.fn(async () => WINGSPAN);
    const api = ownerApi((d) => ({ suggestions: { ...d.suggestions, lookup } }));
    const ADD =
      'mutation ($details: DetailsInput) { addGame(game: "Wingspan", name: "Jess", type: "strategy", details: $details) { item { source details { mins type } } lookup } }';
    const looked = await api.run(ADD, {}, OWNER);
    expect(looked.data).toEqual({
      addGame: { item: { source: 'OWNER', details: { mins: 70, type: 'strategy' } }, lookup: 'FOUND' },
    });
    expect(lookup).toHaveBeenCalledTimes(1);
    api.rawRedis.lists['suggestions:active'] = [];
    const bare = await api.run(ADD, { details: null }, OWNER);
    expect(bare.data).toEqual({
      addGame: { item: { source: 'OWNER', details: { mins: 0, type: 'strategy' } }, lookup: null },
    });
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});

describe('the emailed approve and deny links', () => {
  const OPEN =
    'query ($game: String) { emailedSuggestion(id: "sug-aaaaaa", token: "' +
    TOKEN +
    '") { suggestion { id game name note status } preview(game: $game) { outcome details { name year } } } }';

  it('reads the suggestion and what BoardGameGeek has, writing nothing', async () => {
    const lookup = vi.fn(async () => WINGSPAN);
    const api = testApi((d) => ({ suggestions: { ...d.suggestions, lookup } }));
    api.rawRedis.hashes['suggestions:sug-aaaaaa'] = pending;
    const res = await api.run(OPEN, { game: ' Wingspan ' });
    expect(res.data).toEqual({
      emailedSuggestion: {
        suggestion: { id: 'sug-aaaaaa', game: 'Wingspan', name: 'Alex', note: '', status: 'PENDING' },
        preview: { outcome: 'FOUND', details: { name: 'Wingspan', year: 2019 } },
      },
    });
    expect(lookup).toHaveBeenCalledWith('Wingspan');
    expect(api.rawRedis.hset).not.toHaveBeenCalled();
  });

  it('looks nothing up for a decided suggestion, or when the preview is not asked for', async () => {
    const lookup = vi.fn(async () => WINGSPAN);
    const api = testApi((d) => ({ suggestions: { ...d.suggestions, lookup } }));
    api.rawRedis.hashes['suggestions:sug-aaaaaa'] = { ...pending, status: 'denied', decidedAt: 10 };
    expect((await api.run(OPEN)).data).toMatchObject({
      emailedSuggestion: { suggestion: { status: 'DENIED' }, preview: null },
    });
    await api.run(`{ emailedSuggestion(id: "sug-aaaaaa", token: "${TOKEN}") { suggestion { id } } }`);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('refuses a mismatched link and a bad corrected name', async () => {
    const api = testApi((d) => ({ suggestions: { ...d.suggestions, lookup: async () => WINGSPAN } }));
    api.rawRedis.hashes['suggestions:sug-aaaaaa'] = pending;
    const wrong = await api.run(
      `{ emailedSuggestion(id: "sug-aaaaaa", token: "${'test-token-' + 'z'.repeat(21)}") { suggestion { id } } }`,
    );
    expect(wrong.status).toBe(403);
    expect(wrong.errors[0].extensions?.code).toBe('FORBIDDEN');
    const bad = await api.run(OPEN, { game: 'X' });
    expect(bad.status).toBe(400);
    expect(bad.errors[0].message).toBe('Nothing was looked up: the game must be 2–80 characters.');
  });

  it('decides with the token alone, no session needed', async () => {
    const api = testApi();
    api.rawRedis.hashes['suggestions:sug-aaaaaa'] = pending;
    api.rawRedis.lists['suggestions:active'] = ['sug-aaaaaa'];
    const res = await api.run(
      `mutation { decideSuggestion(id: "sug-aaaaaa", decision: APPROVE, token: "${TOKEN}", game: "Wingspan", details: null) { item { game name status } lookup } }`,
    );
    expect(res.data).toEqual({
      decideSuggestion: { item: { game: 'Wingspan', name: 'Alex', status: 'APPROVED' }, lookup: null },
    });
  });
});

describe('suggestGame', () => {
  it('is public, and limited per IP before anything is stored', async () => {
    const SUGGEST = 'mutation { suggestGame(game: "Cascadia", name: "Sam", note: "Calm") { id status source } }';
    const api = testApi();
    expect((await api.run(SUGGEST)).data).toEqual({
      suggestGame: { id: 'sug-bbbbbb', status: 'PENDING', source: 'FRIEND' },
    });
    const limited = testApi((d) => ({ limiters: { ...d.limiters, suggest: refusing() } }));
    expect((await limited.run(SUGGEST)).status).toBe(429);
    expect(limited.rawRedis.hset).not.toHaveBeenCalled();
    expect(limited.sent).toHaveLength(0);
  });

  it('answers 500, reported under its label, when the email fails', async () => {
    const api = testApi((d) => ({
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
  });
});

describe('the server', () => {
  it('answers 500 without the cause when its dependencies cannot be built', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const yoga = createApi(() => {
      throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN must be set');
    });
    const res = await yoga.fetch('https://games.example/api/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ session { admin } }' }),
    });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('KV_REST_API');
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
