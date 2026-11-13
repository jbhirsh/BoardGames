// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { votes } from '../../api/_db/schema';
import { refusing, testApi, type TestApi } from './helpers/api';
import { curated, seed } from './helpers/rows';

// The wishlist's votes (api/_resolvers/votes.ts) through the API, on a test database.

const READ =
  'query ($ids: [String!]!, $anonId: String) { wishlistVotes(ids: $ids, anonId: $anonId) { counts { id count } myVotes } }';
const VOTE =
  'mutation ($itemId: String!, $anonId: String!, $vote: Int!) { vote(itemId: $itemId, anonId: $anonId, vote: $vote) { itemId count myVote } }';
const ANON = 'anon-aaaaaaaa';
const OTHER = 'anon-bbbbbbbb';

const apis: TestApi[] = [];
async function api(over?: Parameters<typeof testApi>[0]): Promise<TestApi> {
  const made = testApi(over);
  apis.push(made);
  await seed(await made.db(), {
    gameRows: [
      curated(),
      curated({ id: 'azul', name: 'Azul' }),
      curated({ id: 'gone', name: 'Gone', status: 'removed' }),
    ],
  });
  return made;
}
afterEach(async () => {
  await Promise.all(apis.splice(0).map((a) => a.close()));
});

describe('wishlistVotes', () => {
  it('refuses no ids, or more than 100, and takes exactly 100', async () => {
    const a = await api();
    expect((await a.run(READ, { ids: [] })).errors[0].message).toBe('ids is required');
    const many = Array.from({ length: 101 }, (_, i) => `g-${i}`);
    expect((await a.run(READ, { ids: many })).errors[0].message).toBe('too many ids (max 100)');
    expect((await a.run(READ, { ids: many.slice(0, 100) })).errors).toEqual([]);
  });

  it('drops malformed ids, and refuses a list with none left', async () => {
    const a = await api();
    const res = await a.run(READ, { ids: ['seti', 'Bad Id', ' azul '] });
    expect(res.data).toEqual({
      wishlistVotes: {
        counts: [
          { id: 'seti', count: 0 },
          { id: 'azul', count: 0 },
        ],
        myVotes: [],
      },
    });
    expect((await a.run(READ, { ids: ['Bad Id'] })).errors[0].message).toMatch(/at least one valid slug/);
  });

  it('counts every browser and says which this one voted for, ignoring a malformed id', async () => {
    const a = await api();
    await (await a.db()).insert(votes).values([
      { gameId: 'seti', anonId: ANON },
      { gameId: 'seti', anonId: OTHER },
      { gameId: 'azul', anonId: OTHER },
    ]);
    const mine = await a.run(READ, { ids: ['seti', 'azul', 'nobody'], anonId: ANON });
    expect(mine.data).toEqual({
      wishlistVotes: {
        counts: [
          { id: 'seti', count: 2 },
          { id: 'azul', count: 1 },
          { id: 'nobody', count: 0 },
        ],
        myVotes: ['seti'],
      },
    });
    const bad = await a.run(READ, { ids: ['seti'], anonId: 'x' });
    expect(bad.data).toMatchObject({ wishlistVotes: { myVotes: [] } });
  });

  it('is limited per IP', async () => {
    const a = await api((d) => ({ limiters: { ...d.limiters, votes: refusing() } }));
    expect((await a.run(READ, { ids: ['seti'] })).status).toBe(429);
  });

  it('answers 500, reported, when the database fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = await api();
    a.deps.db = async () => {
      throw new Error('database down');
    };
    const res = await a.run(READ, { ids: ['seti'] });
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalledWith('votes api error:', expect.any(Error));
    errSpy.mockRestore();
  });
});

describe('vote', () => {
  it('adds a vote once however often it is sent, and takes it back', async () => {
    const a = await api();
    expect((await a.run(VOTE, { itemId: 'seti', anonId: ANON, vote: 1 })).data).toEqual({
      vote: { itemId: 'seti', count: 1, myVote: 1 },
    });
    expect((await a.run(VOTE, { itemId: 'seti', anonId: ANON, vote: 1 })).data).toMatchObject({ vote: { count: 1 } });
    expect((await a.run(VOTE, { itemId: 'seti', anonId: OTHER, vote: 1 })).data).toMatchObject({ vote: { count: 2 } });
    expect((await a.run(VOTE, { itemId: 'seti', anonId: ANON, vote: 0 })).data).toEqual({
      vote: { itemId: 'seti', count: 1, myVote: 0 },
    });
  });

  it.each([
    [{ itemId: 'Bad Id', anonId: ANON, vote: 1 }, 'invalid itemId'],
    [{ itemId: 'seti', anonId: 'x', vote: 1 }, 'invalid anonId'],
    [{ itemId: 'seti', anonId: ANON, vote: 2 }, 'vote must be 0 or 1'],
  ])('refuses %o', async (variables, message) => {
    expect((await (await api()).run(VOTE, variables)).errors[0].message).toBe(message);
  });

  it('answers 404 for a game not on the wishlist, a removed one included, writing nothing', async () => {
    const a = await api();
    for (const itemId of ['nobody', 'gone']) {
      const res = await a.run(VOTE, { itemId, anonId: ANON, vote: 1 });
      expect(res.errors[0]).toMatchObject({ message: 'unknown itemId', extensions: { code: 'NOT_FOUND' } });
    }
    expect(await (await a.db()).select().from(votes)).toEqual([]);
  });

  it('is limited per IP, before anything is written', async () => {
    const a = await api((d) => ({ limiters: { ...d.limiters, votes: refusing() } }));
    expect((await a.run(VOTE, { itemId: 'seti', anonId: ANON, vote: 1 })).status).toBe(429);
    expect(await (await a.db()).select().from(votes)).toEqual([]);
  });
});
