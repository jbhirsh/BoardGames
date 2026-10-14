import { createContext, type Dispatch } from 'react';
import type { FilterState } from '../data/types';
import type { FilterAction } from './filterReducer';
import type { Game } from '../data/types';
import type { GameGroup } from '../utils/filterGames';

export interface FilterContextValue {
  state: FilterState;
  dispatch: Dispatch<FilterAction>;
  filteredGames: Game[];
  /** filteredGames as the views lay it out: by group, or one flat list. */
  gameGroups: GameGroup[];
}

export const FilterContext = createContext<FilterContextValue | null>(null);
