// @vitest-environment node
import { GraphQLInt, GraphQLList, GraphQLObjectType, GraphQLSchema, GraphQLString, graphql } from 'graphql';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FIELDS_SHOWN,
  addFieldCall,
  fieldPath,
  fieldsShown,
  serverTimingHeader,
  timeRequest,
  type FieldTime,
} from '../../api/_lib/timing';
import { responsePathOf, timedResolvers } from '../../api/_resolvers/timed';
import { testApi, type TestApi } from './helpers/api';
import { curated, seed } from './helpers/rows';

// Each GraphQL field with a resolver of its own, wrapped by
// api/_resolvers/timed.ts and added up by path (api/_lib/timing.ts).

/** A schema whose resolvers say when they've run, with one plain property field. */
function schema() {
  const Item = new GraphQLObjectType({
    name: 'Item',
    fields: {
      name: { type: GraphQLString },
      votes: { type: GraphQLInt, resolve: async () => 1 },
    },
  });
  const Query = new GraphQLObjectType({
    name: 'Query',
    fields: {
      items: {
        type: new GraphQLList(Item),
        resolve: () => [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      },
      hello: { type: GraphQLString, resolve: () => 'hi' },
      thenable: {
        type: GraphQLString,
        resolve: () => ({ then: (done: (value: string) => void) => done('later') }),
      },
      broken: {
        type: GraphQLString,
        resolve: () => {
          throw new Error('no');
        },
      },
      rejected: { type: GraphQLString, resolve: () => Promise.reject(new Error('later')) },
    },
  });
  return timedResolvers(new GraphQLSchema({ query: Query }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

const run = (source: string) =>
  timeRequest(async (read) => {
    await graphql({ schema: schema(), source });
    return read();
  });

describe('each field that does work', () => {
  it('is timed by its path, a list item field added up with its calls and slowest', async () => {
    // A clock that moves 1 ms each time it's read, so every call takes time.
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 1));
    const { fields } = await run('{ items { name votes } hello }');
    expect(fields.map((f) => [f.path, f.label, f.calls])).toEqual([
      ['items', 'Query.items', 1],
      ['hello', 'Query.hello', 1],
      ['items.votes', 'Item.votes', 3],
    ]);
    const votes = fields[2];
    expect(votes.slowestMs).toBeLessThanOrEqual(votes.ms);
    expect(votes.slowestMs * votes.calls).toBeGreaterThanOrEqual(votes.ms);
  });

  it("records each field's first call's start, from the request's start", async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 1));
    const said = await run('{ items { name votes } }');
    const [items, votes] = said.fields;
    expect(items.startMs).toBeGreaterThanOrEqual(0);
    // An item's field starts once the list it's in has been resolved.
    expect(votes.startMs).toBeGreaterThanOrEqual((items.startMs ?? 0) + items.ms);
    expect((votes.startMs ?? 0) + (votes.spanMs ?? 0)).toBeLessThanOrEqual(said.totalMs);
  });

  it("spans a list's items that resolve together from their first start to their last end, its dur their sum", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const Item = new GraphQLObjectType({
      name: 'Item',
      fields: { slow: { type: GraphQLInt, resolve: () => gate.then(() => 1) } },
    });
    const Query = new GraphQLObjectType({
      name: 'Query',
      fields: { items: { type: new GraphQLList(Item), resolve: () => [{}, {}, {}] } },
    });
    const parallel = timedResolvers(new GraphQLSchema({ query: Query }));
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const said = await timeRequest(async (read) => {
      now = 121;
      // Execution calls every item's resolver before it first waits.
      const done = graphql({ schema: parallel, source: '{ items { slow } }' });
      now = 123;
      release();
      await done;
      return read();
    });
    expect(said.fields.find((f) => f.path === 'items.slow')).toEqual({
      path: 'items.slow',
      label: 'Item.slow',
      ms: 6,
      calls: 3,
      slowestMs: 2,
      startMs: 21,
      spanMs: 2,
    });
    expect(serverTimingHeader(said)).toContain(
      'field.items.slow;dur=6;desc="Item.slow";calls=3;slowest=2;span=2;start=21, total;dur=23',
    );
  });

  it('times a resolver that hands back a thenable as async', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 1));
    const { fields } = await run('{ thenable }');
    expect(fields).toEqual([expect.objectContaining({ path: 'thenable', calls: 1 })]);
    expect(fields[0].ms).toBeGreaterThan(0);
  });

  it('never times a plain property read', async () => {
    const { fields } = await run('{ items { name } }');
    expect(fields.map((f) => f.path)).toEqual(['items']);
  });

  it('times a field that throws or rejects, and one under an alias by its alias', async () => {
    const { fields } = await run('{ broken rejected greeting: hello }');
    expect(fields.map((f) => [f.path, f.label])).toEqual([
      ['broken', 'Query.broken'],
      ['greeting', 'Query.hello'],
      ['rejected', 'Query.rejected'],
    ]);
  });

  it('is kept apart per request, and not recorded outside one', async () => {
    await graphql({ schema: schema(), source: '{ hello }' });
    const [a, b] = await Promise.all([run('{ hello }'), run('{ items { name } }')]);
    expect(a.fields.map((f) => f.path)).toEqual(['hello']);
    expect(b.fields.map((f) => f.path)).toEqual(['items']);
  });
});

describe('addFieldCall and fieldsShown', () => {
  it('adds a field up by its path, with its calls and its slowest call', () => {
    const fields = new Map<string, FieldTime>();
    addFieldCall(fields, { responsePath: 'games.wishlist.0.votes', label: 'Game.votes', ms: 2 });
    addFieldCall(fields, { responsePath: 'games.wishlist.1.votes', label: 'Game.votes', ms: 5 });
    expect([...fields.values()]).toEqual([
      { path: 'games.wishlist.votes', label: 'Game.votes', ms: 7, calls: 2, slowestMs: 5 },
    ]);
  });

  it('keeps the earliest start and the latest end of any call, as calls end in any order', () => {
    const fields = new Map<string, FieldTime>();
    addFieldCall(fields, { responsePath: 'games.wishlist.1.votes', label: 'Game.votes', ms: 1, startMs: 5 });
    addFieldCall(fields, { responsePath: 'games.wishlist.0.votes', label: 'Game.votes', ms: 4, startMs: 2 });
    addFieldCall(fields, { responsePath: 'games.wishlist.2.votes', label: 'Game.votes', ms: 1, startMs: 9 });
    expect(fields.get('games.wishlist.votes')).toMatchObject({ ms: 6, calls: 3, startMs: 2, spanMs: 8 });
  });

  it('shows every root field, then the slowest others of at least 1 ms, at most FIELDS_SHOWN', () => {
    const field = (path: string, ms: number): FieldTime => ({ path, label: 'T.f', ms, calls: 1, slowestMs: ms });
    const others = Array.from({ length: FIELDS_SHOWN + 3 }, (_, i) => field(`games.f${i}`, i + 1));
    const shown = fieldsShown([field('games', 0.1), ...others, field('games.tiny', 0.5)]);
    expect(shown[0].path).toBe('games');
    expect(shown.slice(1).map((f) => f.ms)).toEqual(
      Array.from({ length: FIELDS_SHOWN }, (_, i) => FIELDS_SHOWN + 3 - i),
    );
  });

  it("reads a field's response path, list item numbers included", () => {
    const path = {
      prev: { prev: { prev: undefined, key: 'games', typename: 'Query' }, key: 3, typename: undefined },
      key: 'votes',
      typename: 'Game',
    };
    expect(responsePathOf(path)).toBe('games.3.votes');
  });

  it('drops only list item numbers from a path', () => {
    expect(fieldPath('games.wishlist.12.votes')).toBe('games.wishlist.votes');
    expect(fieldPath('games')).toBe('games');
  });

  it('writes when a field started, last, and a repeated one its span', () => {
    expect(
      serverTimingHeader({
        cold: false,
        phases: [],
        fields: [
          { path: 'games', label: 'Query.games', ms: 19.84, calls: 1, slowestMs: 19.84, startMs: 1.44 },
          {
            path: 'games.wishlist.votes',
            label: 'Game.votes',
            ms: 60,
            calls: 30,
            slowestMs: 2.43,
            startMs: 21.26,
            spanMs: 2.51,
          },
        ],
        totalMs: 82.1,
      }),
    ).toBe(
      'field.games;dur=19.8;desc="Query.games";calls=1;start=1.4, ' +
        'field.games.wishlist.votes;dur=60;desc="Game.votes";calls=30;slowest=2.4;span=2.5;start=21.3, total;dur=82.1',
    );
  });

  it('writes a field once as its call, and a repeated one with its calls and slowest', () => {
    expect(
      serverTimingHeader({
        cold: false,
        phases: [],
        fields: [
          { path: 'games', label: 'Query.games', ms: 19.84, calls: 1, slowestMs: 19.84 },
          { path: 'games.wishlist.votes', label: 'Game.votes', ms: 60, calls: 30, slowestMs: 2.43 },
        ],
        totalMs: 24.1,
      }),
    ).toBe(
      'field.games;dur=19.8;desc="Query.games";calls=1, ' +
        'field.games.wishlist.votes;dur=60;desc="Game.votes";calls=30;slowest=2.4, total;dur=24.1',
    );
  });
});

describe("the app's own games query", () => {
  let api: TestApi | undefined;
  afterEach(async () => {
    await api?.close();
    api = undefined;
  });

  it('shows its root field Query.games', async () => {
    api = testApi();
    await seed(await api.db(), { gameRows: [curated()] });
    const url = `/api/graphql?query=${encodeURIComponent('query Games { games { wishlist { id source } } }')}`;
    const said = await timeRequest(async (read) => {
      const res = await api!.fetch(url, { headers: { 'x-graphql-yoga-csrf': '1' } });
      expect(res.status).toBe(200);
      return read();
    });
    expect(said.fields[0]).toMatchObject({ path: 'games', label: 'Query.games', calls: 1 });
    // As api/graphql.ts writes it on the response.
    expect(serverTimingHeader(said)).toMatch(/^field\.games;dur=[\d.]+;desc="Query\.games";calls=1;start=[\d.]+(, |$)/);
    expect(said.fields.every((f) => !/\.\d+(\.|$)/.test(f.path))).toBe(true);
  });
});
