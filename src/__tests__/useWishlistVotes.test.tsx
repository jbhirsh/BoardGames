import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ANON_ID_RE, getAnonId, useWishlistVotes, VOTES_BATCH } from '../hooks/useWishlistVotes';
import { ANON_RE } from '../../api/_lib/ids';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
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
    const denied = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
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
    expect(uuid.mock.results.map((r) => r.value as string)).toContain(id);
    expect(freshGetAnonId()).toBe(id);
    expect(localStorage.getItem('wishlist:anonId')).toBeNull();
  });

  it('still loads and votes when storage is blocked', async () => {
    blockStorage();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ counts: { a: 1 }, myVotes: [] }))
      .mockResolvedValueOnce(jsonResponse({ itemId: 'a', count: 2, myVote: 1 }));

    const { result } = renderHook(() => freshUseWishlistVotes(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.counts).toEqual({ a: 1 });

    await act(async () => {
      await result.current.toggle('a');
    });
    expect(result.current.counts.a).toBe(2);
    const getUrl = new URL(String(fetchSpy.mock.calls[0][0]), 'http://x');
    const postBody = JSON.parse(String(fetchSpy.mock.calls[1][1]?.body)) as { anonId: string };
    expect(getUrl.searchParams.get('anonId')).toMatch(ANON_RE);
    expect(postBody.anonId).toBe(getUrl.searchParams.get('anonId'));
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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const got = decodeURIComponent(url.split('ids=')[1].split('&')[0]).split(',');
      const counts = Object.fromEntries(got.map((id) => [id, id === 'g0' || id === `g${VOTES_BATCH}` ? 2 : 0]));
      return jsonResponse({ counts, myVotes: got.includes(`g${VOTES_BATCH}`) ? [`g${VOTES_BATCH}`] : [] });
    });
    const { result } = renderHook(() => useWishlistVotes(ids));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.counts.g0).toBe(2);
    expect(result.current.counts[`g${VOTES_BATCH}`]).toBe(2);
    expect(result.current.myVotes.has(`g${VOTES_BATCH}`)).toBe(true);
    expect(Object.keys(result.current.counts)).toHaveLength(VOTES_BATCH + 5);
  });

  it('fetches counts and myVotes on mount', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ counts: { a: 3, b: 1 }, myVotes: ['b'] }),
    );

    const { result } = renderHook(() => useWishlistVotes(['a', 'b']));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.counts).toEqual({ a: 3, b: 1 });
    expect(result.current.myVotes.has('b')).toBe(true);
    expect(result.current.myVotes.has('a')).toBe(false);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/votes?ids=a%2Cb'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('toggle posts vote=1 when not yet voted and updates state optimistically', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ counts: { a: 3 }, myVotes: [] }))
      .mockResolvedValueOnce(jsonResponse({ itemId: 'a', count: 4, myVote: 1 }));

    const { result } = renderHook(() => useWishlistVotes(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.toggle('a');
    });

    expect(result.current.counts.a).toBe(4);
    expect(result.current.myVotes.has('a')).toBe(true);
    const postCall = fetchSpy.mock.calls[1];
    expect(postCall[0]).toBe('/api/votes');
    expect(JSON.parse(postCall[1]!.body as string)).toEqual({
      itemId: 'a',
      anonId: 'anon-abcdefgh',
      vote: 1,
    });
  });

  it('toggle posts vote=0 when removing an existing vote', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ counts: { a: 5 }, myVotes: ['a'] }))
      .mockResolvedValueOnce(jsonResponse({ itemId: 'a', count: 4, myVote: 0 }));

    const { result } = renderHook(() => useWishlistVotes(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.toggle('a');
    });

    expect(result.current.myVotes.has('a')).toBe(false);
    expect(result.current.counts.a).toBe(4);
    expect(JSON.parse(fetchSpy.mock.calls[1][1]!.body as string)).toMatchObject({ vote: 0 });
  });

  it('reverts optimistic update when POST fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ counts: { a: 3 }, myVotes: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: 'nope' }, false));

    const { result } = renderHook(() => useWishlistVotes(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.toggle('a');
    });

    expect(result.current.counts.a).toBe(3);
    expect(result.current.myVotes.has('a')).toBe(false);
  });

  it('marks loaded=true even when fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useWishlistVotes(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.counts).toEqual({});
  });

  it('marks loaded=true immediately when no ids provided', async () => {
    vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useWishlistVotes([]));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
