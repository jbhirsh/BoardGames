import { createContext } from 'react';
import type { OwnersData } from '../hooks/useOwnersData';

/**
 * Defaults to an empty, loaded, no-op view so components render sensibly
 * outside the provider (unit tests, pages without ownership).
 */
export const OwnersContext = createContext<OwnersData>({
  owners: {},
  mine: new Set(),
  loaded: true,
  toggle: async () => true,
});
