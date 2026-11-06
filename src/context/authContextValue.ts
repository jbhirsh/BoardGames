import { createContext } from 'react';
import type { Auth } from '../hooks/useAuth';

/** Defaults to "not signed in" so components render sensibly outside the provider. */
export const AuthContext = createContext<Auth>({
  admin: false,
  loaded: true,
  refresh: async () => {},
});
