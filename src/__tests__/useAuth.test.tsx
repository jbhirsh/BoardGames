import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAuthState } from '../hooks/useAuth';
import { gqlError, operations, stubGraphql } from './helpers/graphqlFetch';

const session = (admin: boolean) => () => ({ session: { admin } });

describe('useAuthState', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the session once and reports what it says', async () => {
    const spy = stubGraphql({ Session: session(true) });
    const { result } = renderHook(() => useAuthState());
    expect(result.current.loaded).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.admin).toBe(true);
    expect(operations(spy).map((o) => o.operationName)).toEqual(['Session']);
    expect(spy.mock.calls[0][1]?.signal).toEqual(expect.any(AbortSignal));

    stubGraphql({ Session: session(false) });
    const { result: out } = renderHook(() => useAuthState());
    await waitFor(() => expect(out.current.loaded).toBe(true));
    expect(out.current.admin).toBe(false);
  });

  it('treats a failed check as signed out', async () => {
    stubGraphql({ Session: () => gqlError('Server error', 'INTERNAL_SERVER_ERROR', 500) });
    const { result } = renderHook(() => useAuthState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.admin).toBe(false);
  });

  it('ignores a check that answers after the page has gone', async () => {
    let answer: (response: Response) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    const { result, unmount } = renderHook(() => useAuthState());
    unmount();
    answer(Response.json({ data: { session: { admin: true } } }));
    await Promise.resolve();
    expect(result.current).toMatchObject({ admin: false, loaded: false });
  });

  it('asks again on refresh, as a session changed on the page', async () => {
    let admin = false;
    const spy = stubGraphql({ Session: () => ({ session: { admin } }) });
    const { result } = renderHook(() => useAuthState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.admin).toBe(false);
    admin = true;
    await act(() => result.current.refresh());
    expect(result.current.admin).toBe(true);
    expect(operations(spy).map((o) => o.operationName)).toEqual(['Session', 'Session']);

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    await act(() => result.current.refresh());
    expect(result.current).toMatchObject({ admin: false, loaded: true });
  });
});
