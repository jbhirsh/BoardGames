import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ANON_ID_RE, getAnonId, useWishlistVotes, VOTES_BATCH } from '../hooks/useWishlistVotes';
import { ANON_RE } from '../../api/_lib/ids';
import { gqlError, operations, stubGraphql, type Handlers } from './helpers/graphqlFetch';

/** The votes API answering from stored counts, this browser's votes, and a vote's new count. */
function votesApi(
  counts: Record<string, number>,
  mine: string[] = [],
  vote: Handlers[string] = () => ({ vote: { count: 0 } }),
) {
  return stubGraphql({
    WishlistVotes: ({ ids }) => {
      const asked = ids as string[];
      return {
        wishlistVotes: {
          counts: asked.map((id) => ({ id, count: counts[id] ?? 0 })),
          myVotes: mine.filter((id) => asked.includes(id)),
        },
      };
    },
    Vote: vote,
  });
}

describe('getAnonId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generates and persists a UUID', () => {
    const id = getAnonId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(localStorage.getItem('wishlist:anonId')).toBe(id);
  });

  it('returns the same id on subsequent calls', () => {
    const first = getAnonId();
    const second = getAnonId();
    expect(first).toBe(second);
  });

  it('keeps a stored id the votes API accepts', () => {
    localStorage.setItem('wishlist:anonId', 'anon-abcdefgh');
    expect(getAnonId()).toBe('anon-abcdefgh');
  });

  // The API ignores a malformed id on GET and answers 400 to every vote, so
  // a stored value it would reject is replaced rather than sent.
  it.each(['short', 'has spaces in it', 'x'.repeat(65), 'semi;colon-id'])(
    'replaces a stored id the API would reject (%s) with a fresh one',
    (bad) => {
      localStorage.setItem('wishlist:anonId', bad);
      const id = getAnonId();
      expect(id).not.toBe(bad);
      expect(id).toMatch(ANON_RE);
      expect(localStorage.getItem('wishlist:anonId')).toBe(id);
      expect(getAnonId()).toBe(id);
    },
  );

  // src can't import api (dependency-cruiser), so the client mirrors the
  // server's pattern by hand; this keeps the two in step.
  it('checks ids against the same pattern as the votes API', () => {
    expect(ANON_ID_RE.source).toBe(ANON_RE.source);
    expect(ANON_ID_RE.flags).toBe(ANON_RE.flags);
  });
});

describe('getAnonId without storage', () => {
  // The in-memory id lives at module level, so each test loads the hook
  // module afresh; otherwise one test's id would carry into the next and a
  // test could pass without generating an id at all.
  let freshGetAnonId: typeof getAnonId;
  let freshUseWishlistVotes: typeof useWishlistVotes;

  beforeEach(async () => {
    vi.resetModules();
    ({ getAnonId: freshGetAnonId, useWishlistVotes: freshUseWishlistVotes } =
      await import('../hooks/useWishlistVotes'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function blockStorage() {
    const denied = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
  }

  it('uses one in-memory id for the session when storage is blocked', () => {
    blockStorage();
    const id = freshGetAnonId();
    expect(id).toMatch(ANON_RE);
    expect(freshGetAnonId()).toBe(id);
  });

  it('uses an in-memory id when the id cannot be saved', () => {
    localStorage.clear();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const uuid = vi.spyOn(crypto, 'randomUUID');
    const id = freshGetAnonId();
    expect(id).toMatch(ANON_RE);
    expect(uuid.mock.results.map(({ value }: { value: unknown }) => value)).toContain(id);
    expect(freshGetAnonId()).toBe(id);
    expect(localStorage.getItem('wishlist:anonId')).toBeNull();
  });

  it('still loads and votes when storage is blocked', async () => {
    blockStorage();
    const spy = votesApi({ a: 1 }, [], () => ({ vote: { count: 2 } }));
    const { result } = renderHook(() => freshUseWishlistVotes(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.counts).toEqual({ a: 1 });

    await act(async () => {
      await result.current.toggle('a');
    });
    expect(result.current.counts.a).toBe(2);
    const [read, cast] = operations(spy);
    expect(read.variables.anonId).toMatch(ANON_RE);
    expect(cast.variables.anonId).toBe(read.variables.anonId);
  });
});

describe('useWishlistVotes', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('wishlist:anonId', 'anon-abcdefgh');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('splits large id sets into batches the API accepts and merges the results', async () => {
    const ids = Array.from({ length: VOTES_BATCH + 5 }, (_, i) => `g${i}`);
    const spy = votesApi({ g0: 2, [`g${VOTES_BATCH}`]: 2 }, [`g${VOTES_BATCH}`]);
    const { result } = renderHook(() => useWishlistVotes(ids));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(operations(spy).map((o) => (o.variables.ids as string[]).length)).toEqual([VOTES_BATCH, 5]);
    expect(result.current.counts.g0).toBe(2);
    expect(result.current.counts[`g${VOTES_BATCH}`]).toBe(2);
    expect(result.current.myVotes.has(`g${VOTES_BATCH}`)).toBe(true);
    expect(Object.keys(result.current.counts)).toHaveLength(VOTES_BATCH + 5);
  });

  it('fetches counts and myVotes on mount', async () => {
    const spy = votesApi({ a: 3, b: 1 }, ['b']);
    const { result } = renderHook(() => useWishlistVotes(['a', 'b']));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.counts).toEqual({ a: 3, b: 1 });
    expect(result.current.myVotes.has('b')).toBe(true);
    expect(result.current.myVotes.has('a')).toBe(false);
    expect(operations(spy)).toMatchObject([
      { operationName: 'WishlistVotes', variables: { ids: ['a', 'b'], anonId: 'anon-abcdefgh' } },
    ]);
    expect(spy.mock.calls[0][1]?.signal).toEqual(expect.any(AbortSignal));
  });

  it('toggle votes 1 when not yet voted and takes the count the API answers', async () => {
    const spy = votesApi({ a: 3 }, [], () => ({ vote: { count: 4 } }));
    const { result } = renderHook(() => useWishlistVotes(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.toggle('a');
    });

    expect(result.current.counts.a).toBe(4);
    expect(result.current.myVotes.has('a')).toBe(true);
    expect(operations(spy)[1]).toMatchObject({
      operationName: 'Vote',
      variables: { itemId: 'a', anonId: 'anon-abcdefgh', vote: 1 },
    });
  });

  it('shows the vote at once, before the API answers, and ignores a second press meanwhile', async () => {
    let answer = () => {};
    const spy = votesApi(
      { a: 3 },
      [],
      () => new Promise((resolve) => (answer = () => resolve({ vote: { count: 9 } }))),
    );
    const { result } = renderHook(() => useWishlistVotes(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.toggle('a');
    });
    expect(result.current.counts.a).toBe(4);
    await act(async () => {
      await result.current.toggle('a');
    });
    await vi.waitFor(() => expect(operations(spy)).toHaveLength(2));
    answer();
    await act(() => first);
    expect(result.current.counts.a).toBe(9);
    expect(operations(spy)).toHaveLength(2);
  });

  it('toggle votes 0 when removing an existing vote', async () => {
    const spy = votesApi({ a: 5 }, ['a'], () => ({ vote: { count: 4 } }));
    const { result } = renderHook(() => useWishlistVotes(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.toggle('a');
    });

    expect(result.current.myVotes.has('a')).toBe(false);
    expect(result.current.counts.a).toBe(4);
    expect(operations(spy)[1].variables).toMatchObject({ vote: 0 });
  });

  it('reverts the optimistic update when the vote is refused or lost', async () => {
    for (const refused of [true, false]) {
      votesApi({ a: 3 }, [], () => gqlError('unknown itemId', 'NOT_FOUND', 404));
      const { result } = renderHook(() => useWishlistVotes(['a']));
      await waitFor(() => expect(result.current.loaded).toBe(true));
      if (!refused) vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await act(async () => {
        await result.current.toggle('a');
      });
      expect(result.current.counts.a).toBe(3);
      expect(result.current.myVotes.has('a')).toBe(false);
    }
  });

  it('marks loaded=true even when the counts cannot be read, and says so', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useWishlistVotes(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.counts).toEqual({});
    expect(errSpy).toHaveBeenCalledWith('votes: could not load vote counts', expect.any(Error));
  });

  it('says nothing about a read cut short by leaving the page', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    votesApi({ a: 1 });
    const { unmount } = renderHook(() => useWishlistVotes(['a']));
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('marks loaded=true immediately when no ids provided', async () => {
    vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useWishlistVotes([]));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
