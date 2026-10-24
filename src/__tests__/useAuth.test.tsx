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

  it('requests a link and relays the outcome', async () => {
    const spy = stubGraphql({
      Session: session(false),
      RequestSignInLink: ({ email }) =>
        email === 'jess@example.com'
          ? { requestSignInLink: true }
          : gqlError('Sign-in is not set up yet', 'UNAVAILABLE', 503),
    });
    const { result } = renderHook(() => useAuthState());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(await result.current.requestLink('jess@example.com')).toEqual({ ok: true });
    expect(operations(spy).at(-1)).toMatchObject({
      operationName: 'RequestSignInLink',
      variables: { email: 'jess@example.com' },
    });
    expect(await result.current.requestLink('x@y.z')).toEqual({ ok: false, error: 'Sign-in is not set up yet' });

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    expect(await result.current.requestLink('x@y.z')).toEqual({
      ok: false,
      error: 'Something went wrong. Try again in a minute.',
    });
  });

  it('logs out through the API and drops admin mode even if that call fails', async () => {
    const spy = stubGraphql({ Session: session(true), Logout: () => ({ logout: true }) });
    const { result } = renderHook(() => useAuthState());
    await waitFor(() => expect(result.current.admin).toBe(true));
    await act(() => result.current.logout());
    expect(result.current.admin).toBe(false);
    expect(operations(spy).at(-1)?.operationName).toBe('Logout');

    stubGraphql({ Session: session(true) });
    const { result: again } = renderHook(() => useAuthState());
    await waitFor(() => expect(again.current.admin).toBe(true));
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    await act(() => again.current.logout());
    expect(again.current.admin).toBe(false);
  });
});
