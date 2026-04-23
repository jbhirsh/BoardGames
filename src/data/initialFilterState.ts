import type { FilterState, KeywordId } from './types';

export const initialFilterState: FilterState = Object.freeze({
  duration: 'all',
  players: 0,
  keywords: new Set<KeywordId>(),
  keywordMode: 'or',
  search: '',
  sort: 'az',
  baseSort: 'az',
  view: 'list',
}) as FilterState;
