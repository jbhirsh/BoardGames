export type DurationCategory = 'quick' | 'medium' | 'long';
export type GroupId = 'social' | 'word' | 'party' | 'strat' | 'coop';
export type KeywordId =
  | 'social' | 'bluffing' | 'deduction'
  | 'strategy' | 'negotiation' | 'abstract' | 'deck-building'
  | 'cooperative' | 'team'
  | 'party' | 'adult' | 'active' | 'creative'
  | 'card-game' | 'word'
  | 'family' | 'classic' | 'thematic' | 'portable' | 'quick-play';

/**
 * What the filter bar, search and sort need. Both owned games and wishlist
 * entries satisfy it, so one filter pipeline serves the Own and Want views.
 */
export interface Filterable {
  name: string;
  desc: string;
  min: number;
  max: number;
  dur: string;
  mins: number;
  cat: DurationCategory;
  kw: KeywordId[];
}

export interface Game extends Filterable {
  slug: string;
  img: string;
  rules: string;
  players: string;
  group: GroupId;
  short: string;
  detail: string;
  yt: string;
  awards: Award[];
}

export type WishlistType = 'two-player' | 'coop' | 'strategy' | 'heavy' | 'party' | 'suggested';

/** One confirmed award win from a recognised body (nominations excluded). */
export interface Award {
  name: string;
  year: number;
}


export interface WishlistItem extends Filterable {
  id: string;
  yt: string;
  players: string;
  type: WishlistType;
  awards: Award[];
  /** Amazon product id of the standard edition, when verified; buy links fall back to a search without it. */
  asin?: string;
  /** Set on approved friend suggestions: the display name that suggested it. */
  suggestedBy?: string;
  /** Present on entries that live in the suggestions store (editable by the owner); absent on compiled-in entries. */
  source?: 'friend' | 'owner';
  /** The stored description on its own, without the credit line, for the owner's edit form. */
  blurb?: string;
}

export type DurationFilter = 'all' | DurationCategory;
export type SortMode = 'az' | 'group' | 'quick' | 'long'
  | 'name-asc' | 'name-desc'
  | 'dur-asc' | 'dur-desc'
  | 'players-asc' | 'players-desc';
export type ViewMode = 'grid' | 'list';
/** Which list the filter bar drives: the games we own or the ones we want. */
export type CollectionMode = 'own' | 'want';
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
  collection: CollectionMode;
}
