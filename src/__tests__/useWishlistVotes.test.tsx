import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { getAnonId, useWishlistVotes, VOTES_BATCH } from '../hooks/useWishlistVotes';

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
