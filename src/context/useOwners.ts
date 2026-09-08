import { useContext } from 'react';
import { OwnersContext } from './ownersContextValue';
import type { OwnersData } from '../hooks/useOwnersData';

export function useOwners(): OwnersData {
  return useContext(OwnersContext);
}
