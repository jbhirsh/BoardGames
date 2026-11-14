import { createContext } from 'react';
import type { Auth } from '../hooks/useAuth';

/**
 * Defaults to "not signed in" so components render sensibly outside the
 * provider; so a page that needs the owner's session must sit in one, or it
 * never asks and reads as signed out.
 */
export const AuthContext = createContext<Auth>({
  admin: false,
  loaded: true,
  refresh: async () => {},
});
