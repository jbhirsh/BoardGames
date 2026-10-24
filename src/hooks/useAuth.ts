import { useCallback, useEffect, useState } from 'react';
import { request } from '../client/graphql';
import { LogoutDocument, RequestSignInLinkDocument, SessionDocument } from '../gql/graphql';

interface AuthState {
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
    void request(SessionDocument, {}, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setState({ admin: result.ok && result.data.session.admin, loaded: true });
    });
    return () => controller.abort();
  }, []);

  const requestLink = useCallback(async (email: string) => {
    const result = await request(RequestSignInLinkDocument, { email });
    return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
  }, []);

  const logout = useCallback(async () => {
    // A failed call means the cookie clear may not have reached the server;
    // the UI still drops admin mode.
    await request(LogoutDocument, {});
    setState({ admin: false, loaded: true });
  }, []);

  return { ...state, requestLink, logout };
}
