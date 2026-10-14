import type { ReactNode } from 'react';
import { useAuthState } from '../hooks/useAuth';
import { AuthContext } from './authContextValue';

/**
 * Checks the owner session once and shares it with every admin control on
 * the page (SignInPage, AdminPanel, AdminItemControls), which switch admin
 * mode on. It wraps only the home page and the /sign-in route, each with
 * an instance of its own, so the rules, score and word-checker pages never
 * call /api/auth.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
