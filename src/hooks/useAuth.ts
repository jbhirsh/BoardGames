import { useCallback, useEffect, useState } from 'react';
import { request } from '../client/graphql';
import { SessionDocument } from '../gql/graphql';

interface AuthState {
  /** True when this browser's session is the owner's. */
  admin: boolean;
  loaded: boolean;
}

export interface Auth extends AuthState {
  /**
   * Asks again, after something changed the session without leaving the
   * page: a passkey sign-in, a passkey added, a sign-out. A Google sign-in
   * comes back through a redirect, which loads the page afresh.
   */
  refresh: () => Promise<void>;
}

/** Whether the session is the owner's, by Query.session; failure means "not signed in". */
async function readAdmin(signal?: AbortSignal): Promise<boolean> {
  const result = await request(SessionDocument, {}, signal);
  return result.ok && result.data.session.admin;
}

/** Owner session state, checked once per page load and on refresh(). */
export function useAuthState(): Auth {
  const [state, setState] = useState<AuthState>({ admin: false, loaded: false });

  useEffect(() => {
    const controller = new AbortController();
    void readAdmin(controller.signal).then((admin) => {
      if (controller.signal.aborted) return;
      setState({ admin, loaded: true });
    });
    return () => controller.abort();
  }, []);

  const refresh = useCallback(async () => {
    setState({ admin: await readAdmin(), loaded: true });
  }, []);

  return { ...state, refresh };
}
