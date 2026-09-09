import { useCallback, useEffect, useState } from 'react';
import { callJson } from './adminApi';

export interface AuthState {
  /** True when this browser holds a live owner session. */
  admin: boolean;
  loaded: boolean;
}

export interface Auth extends AuthState {
  /** Asks for a sign-in link; the answer never says whether the address was the owner's. */
  requestLink: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
}

/** Owner session state, checked once per page load. Failure means "not signed in". */
export function useAuthState(): Auth {
  const [state, setState] = useState<AuthState>({ admin: false, loaded: false });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fetch failed'))))
      .then((data: { admin?: unknown }) => setState({ admin: data.admin === true, loaded: true }))
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setState({ admin: false, loaded: true });
      });
    return () => controller.abort();
  }, []);

  const requestLink = useCallback(async (email: string) => {
    const result = await callJson('/api/auth', 'POST', { email });
    return result.ok ? { ok: true as const } : result;
  }, []);

  const logout = useCallback(async () => {
    // A failed call means the cookie clear may not have reached the server;
    // the UI still drops admin mode.
    await callJson('/api/auth', 'POST', { action: 'logout' });
    setState({ admin: false, loaded: true });
  }, []);

  return { ...state, requestLink, logout };
}
