import { useContext } from 'react';
import { AuthContext } from './authContextValue';
import type { Auth } from '../hooks/useAuth';

export function useAuth(): Auth {
  return useContext(AuthContext);
}
