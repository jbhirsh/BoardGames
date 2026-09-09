import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAuthState } from '../hooks/useAuth';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

describe('useAuthState', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the session once and reports admin only on an explicit true', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ admin: true }));
    const { result } = renderHook(() => useAuthState());
    expect(result.current.loaded).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.admin).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith('/api/auth', expect.objectContaining({ signal: expect.any(AbortSignal) }));

    fetchSpy.mockResolvedValue(jsonResponse({ admin: 'yes' }));
    const { result: loose } = renderHook(() => useAuthState());
    await waitFor(() => expect(loose.current.loaded).toBe(true));
    expect(loose.current.admin).toBe(false);
  });

  it('treats a failed check as signed out', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, false));
    const { result } = renderHook(() => useAuthState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.admin).toBe(false);
  });

  it('requests a link as JSON and relays the outcome', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ admin: false }));
    const { result } = renderHook(() => useAuthState());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
    expect(await result.current.requestLink('jess@example.com')).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenLastCalledWith('/api/auth', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jess@example.com' }),
    }));

    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: 'Sign-in is not set up yet' }, false));
    expect(await result.current.requestLink('x@y.z')).toEqual({ ok: false, error: 'Sign-in is not set up yet' });

    fetchSpy.mockResolvedValueOnce({ ok: false, json: async () => { throw new Error('no body'); } } as unknown as Response);
    expect(await result.current.requestLink('x@y.z')).toEqual({ ok: false, error: 'Something went wrong. Try again in a minute.' });

    fetchSpy.mockRejectedValueOnce(new Error('offline'));
    expect(await result.current.requestLink('x@y.z')).toEqual({ ok: false, error: 'Something went wrong. Try again in a minute.' });
  });

  it('logs out through the API and drops admin mode even if that call fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ admin: true }));
    const { result } = renderHook(() => useAuthState());
    await waitFor(() => expect(result.current.admin).toBe(true));

    fetchSpy.mockRejectedValueOnce(new Error('offline'));
    await act(() => result.current.logout());
    expect(result.current.admin).toBe(false);
    expect(fetchSpy).toHaveBeenLastCalledWith('/api/auth', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'logout' }),
    }));
  });
});
