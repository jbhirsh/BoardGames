import type { ReactNode } from 'react';
import { useAuthState } from '../hooks/useAuth';
import { AuthContext } from './authContextValue';

/** Checks the owner session once and shares it with every admin control on the page. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
