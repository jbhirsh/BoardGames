import { createContext } from 'react';
import type { Auth } from '../hooks/useAuth';

/** Defaults to "not signed in" so components render sensibly outside the provider. */
export const AuthContext = createContext<Auth>({
  admin: false,
  loaded: true,
  requestLink: async () => ({ ok: false, error: 'Sign-in is not available here' }),
  logout: async () => {},
});
