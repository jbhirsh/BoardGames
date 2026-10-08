import type { DurationFilter, GroupId, KeywordId, TimeBudget, WishlistType } from './types';

export const KW: Record<KeywordId, string> = {
  'social': 'Social',
  'bluffing': 'Bluffing',
  'deduction': 'Deduction',
  'strategy': 'Strategy',
  'negotiation': 'Negotiation',
  'abstract': 'Abstract',
  'deck-building': 'Deck-Building',
  'cooperative': 'Cooperative',
  'team': 'Team',
  'party': 'Party',
  'adult': 'Adult',
  'active': 'Active / Physical',
  'creative': 'Creative',
  'card-game': 'Card Game',
  'word': 'Word',
  'family': 'Family',
  'classic': 'Classic',
  'thematic': 'Thematic',
  'portable': 'Portable',
  'quick-play': 'Quick Play',
};

export const GROUPS: Record<GroupId, string> = {
  social: 'Social Deduction',
  word: 'Word & Clue',
  party: 'Party & Active',
  strat: 'Strategy',
  coop: 'Cooperative',
};

export const GROUP_ORDER: GroupId[] = ['social', 'word', 'party', 'strat', 'coop'];

export const WISHLIST_TYPES: Record<WishlistType, string> = {
  'two-player': 'Two-Player',
  coop: 'Cooperative',
  strategy: 'Strategy',
  heavy: 'Heavy Strategy',
  party: 'Party & Card',
  suggested: 'Suggested by friends',
};

/** The sections the owner can file a game under: every wishlist type but the friends' one. */
export const WISHLIST_SECTIONS: Exclude<WishlistType, 'suggested'>[] = ['party', 'strategy', 'coop', 'two-player', 'heavy'];

export const WISHLIST_TYPE_ORDER: WishlistType[] = ['party', 'strategy', 'coop', 'two-player', 'heavy', 'suggested'];

/** The time budgets the duration filter offers, in minutes. */
export const TIME_BUDGETS: readonly TimeBudget[] = [15, 30, 60];

/** The duration filter's pill: "Duration" until a budget is picked. */
export const DUR_LABELS: Record<DurationFilter, string> = {
  all: 'Duration',
  15: 'Up to 15 min',
  30: 'Up to 30 min',
  60: 'Up to 60 min',
};

export const DUR_PILL_LABELS: Record<string, string> = {
  quick: 'Quick',
  medium: 'Medium',
  long: 'Long',
};

export const PLAYER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** "1 player", "4 players". */
export function playersLabel(n: number): string {
  return n === 1 ? '1 player' : `${n} players`;
}
