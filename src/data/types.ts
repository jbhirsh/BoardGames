export type DurationCategory = 'quick' | 'medium' | 'long';
export type GroupId = 'social' | 'word' | 'party' | 'strat' | 'coop';
export type KeywordId =
  | 'social' | 'bluffing' | 'deduction'
  | 'strategy' | 'negotiation' | 'abstract' | 'deck-building'
  | 'cooperative' | 'team'
  | 'party' | 'adult' | 'active' | 'creative'
  | 'card-game' | 'word'
  | 'family' | 'classic' | 'thematic' | 'portable' | 'quick-play';

export interface Game {
  name: string;
  slug: string;
  img: string;
  rules: string;
  players: string;
  min: number;
  max: number;
  dur: string;
  mins: number;
  cat: DurationCategory;
  group: GroupId;
  kw: KeywordId[];
  short: string;
  desc: string;
  detail: string;
  yt: string;
}

export interface WishlistItem {
  id: string;
  name: string;
  desc: string;
  yt: string;
}

export type DurationFilter = 'all' | DurationCategory;
export type SortMode = 'az' | 'group' | 'quick' | 'long'
  | 'name-asc' | 'name-desc'
  | 'dur-asc' | 'dur-desc'
  | 'players-asc' | 'players-desc';
export type ViewMode = 'grid' | 'list';
export type KeywordMode = 'and' | 'or';

export interface FilterState {
  duration: DurationFilter;
  players: number;
  keywords: Set<KeywordId>;
  keywordMode: KeywordMode;
  search: string;
  sort: SortMode;
  baseSort: SortMode;
  view: ViewMode;
}

export const initialFilterState: FilterState = {
  duration: 'all',
  players: 0,
  keywords: new Set<KeywordId>(),
  keywordMode: 'or',
  search: '',
  sort: 'az',
  baseSort: 'az',
  view: 'list',
};
