import type { ReactNode } from 'react';
import { useOwnersData } from '../hooks/useOwnersData';
import { OwnersContext } from './ownersContextValue';

/** Loads ownership for `ids` once and shares it with every card and row below. */
export function OwnersProvider({ ids, children }: { ids: readonly string[]; children: ReactNode }) {
  const value = useOwnersData(ids);
  return <OwnersContext.Provider value={value}>{children}</OwnersContext.Provider>;
}
