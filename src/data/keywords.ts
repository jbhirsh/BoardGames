import type { GroupId, KeywordId } from './types';

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

export const DUR_LABELS: Record<string, string> = {
  all: 'Duration',
  quick: '≤ 15 min',
  medium: '30–60 min',
  long: '60+ min',
};

export const DUR_PILL_LABELS: Record<string, string> = {
  quick: 'Quick',
  medium: 'Medium',
  long: 'Long',
};

export const PLAYER_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 10] as const;
