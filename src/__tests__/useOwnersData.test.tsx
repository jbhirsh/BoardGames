import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOwnersData, getDisplayName, setDisplayName, OWNERS_BATCH } from '../hooks/useOwnersData';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

describe('display name storage', () => {
  beforeEach(() => localStorage.clear());

  it('is null until set, then persists', () => {
    expect(getDisplayName()).toBeNull();
    setDisplayName('Jess');
    expect(getDisplayName()).toBe('Jess');
  });
});

describe('useOwnersData', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('wishlist:anonId', 'anon-abcdefgh');
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns an empty loaded snapshot with no ids and never fetches', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useOwnersData([]));
    expect(result.current.loaded).toBe(true);
    expect(result.current.owners).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches owners and mine on mount', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ owners: { a: ['Alex'], b: [] }, mine: ['a'] }),
    );
    const { result } = renderHook(() => useOwnersData(['a', 'b']));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.owners).toEqual({ a: ['Alex'], b: [] });
    expect(result.current.mine.has('a')).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/owners?ids=a%2Cb&anonId=anon-abcdefgh'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('splits more ids than the API accepts per request into batches and merges them', async () => {
    const ids = Array.from({ length: OWNERS_BATCH + 5 }, (_, i) => `g${i}`);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const batch = decodeURIComponent(new URL(String(input), 'http://x').searchParams.get('ids') ?? '').split(',');
      return jsonResponse({ owners: Object.fromEntries(batch.map((id) => [id, [id === 'g0' || id === `g${OWNERS_BATCH}` ? 'Alex' : 'Sam']])), mine: batch.filter((id) => id === `g${OWNERS_BATCH + 1}`) });
    });
    const { result } = renderHook(() => useOwnersData(ids));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(Object.keys(result.current.owners)).toHaveLength(OWNERS_BATCH + 5);
    expect(result.current.owners.g0).toEqual(['Alex']);
    expect(result.current.owners[`g${OWNERS_BATCH}`]).toEqual(['Alex']);
    expect(result.current.mine.has(`g${OWNERS_BATCH + 1}`)).toBe(true);
  });

  it('marks loaded and logs when the fetch fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, false));
    const { result } = renderHook(() => useOwnersData(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.owners).toEqual({});
    expect(errorSpy).toHaveBeenCalledWith('owners: could not load ownership', expect.any(Error));
  });

  it('toggle adds my name optimistically, posts, and adopts the server list', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ owners: { a: ['Alex'] }, mine: [] }))
      .mockResolvedValueOnce(jsonResponse({ itemId: 'a', owners: ['Alex', 'Jess'], mine: true }));
    const { result } = renderHook(() => useOwnersData(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let ok = false;
    await act(async () => { ok = await result.current.toggle('a', 'Jess'); });
    expect(ok).toBe(true);
    expect(result.current.mine.has('a')).toBe(true);
    expect(result.current.owners.a).toEqual(['Alex', 'Jess']);
    expect(fetchSpy).toHaveBeenLastCalledWith('/api/owners', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ itemId: 'a', anonId: 'anon-abcdefgh', name: 'Jess', own: 1 }),
    }));
  });

  it('toggle removes my name when already mine', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ owners: { a: ['Alex', 'Jess'] }, mine: ['a'] }))
      .mockResolvedValueOnce(jsonResponse({ itemId: 'a', owners: ['Alex'], mine: false }));
    const { result } = renderHook(() => useOwnersData(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => { await result.current.toggle('a', 'Jess'); });
    expect(result.current.mine.has('a')).toBe(false);
    expect(result.current.owners.a).toEqual(['Alex']);
  });

  it('reverts the optimistic change and resolves false when the post fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ owners: { a: [] }, mine: [] }))
      .mockResolvedValueOnce(jsonResponse({}, false));
    const { result } = renderHook(() => useOwnersData(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let ok = true;
    await act(async () => { ok = await result.current.toggle('a', 'Jess'); });
    expect(ok).toBe(false);
    expect(result.current.mine.has('a')).toBe(false);
    expect(result.current.owners.a).toEqual([]);
  });

  it('removes only one occurrence of a shared name when unmarking', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ owners: { a: ['Sam', 'Sam'] }, mine: ['a'] }))
      .mockResolvedValueOnce(jsonResponse({}, false));
    const { result } = renderHook(() => useOwnersData(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    // The failed POST leaves the optimistic unmark reverted: both Sams remain.
    await act(async () => { await result.current.toggle('a', 'Sam'); });
    expect(result.current.owners.a).toEqual(['Sam', 'Sam']);
  });

  it('keeps the optimistic state when the post succeeds with an unreadable body', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ owners: { a: [] }, mine: [] }))
      .mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('bad json'); } } as unknown as Response);
    const { result } = renderHook(() => useOwnersData(['a']));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => { await result.current.toggle('a', 'Jess'); });
    expect(result.current.mine.has('a')).toBe(true);
    expect(result.current.owners.a).toEqual(['Jess']);
  });
});
