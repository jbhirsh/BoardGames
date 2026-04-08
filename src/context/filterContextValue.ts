import { createContext, type Dispatch } from 'react';
import type { FilterState } from '../data/types';
import type { FilterAction } from './filterReducer';
import type { Game } from '../data/types';

export interface FilterContextValue {
  state: FilterState;
  dispatch: Dispatch<FilterAction>;
  filteredGames: Game[];
}

export const FilterContext = createContext<FilterContextValue | null>(null);
