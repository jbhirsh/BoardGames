// What a wishlist entry may hold, for every part of the API that writes one:
// the BoardGameGeek lookup (bgg.ts), which caps what it finds to these, the
// resolvers' checks (_resolvers/) and the tables' (Zod, _db/validation.ts),
// which would otherwise import a resolver. The client's
// forms mirror these (src/data/suggestionLimits.ts and src/data/keywords.ts):
// the two trees can't import each other, so tests keep them in step.

/** The most players an entry can list (BGG has party games at 100 and more). */
export const PLAYERS_MAX = 99;
/** The longest playing time an entry can list, in minutes. */
export const MINS_MAX = 600;
/** The longest description kept or saved, in characters; BGG's are rarely longer. */
export const DESC_MAX = 5000;

/** A display name: letters or digits first, then letters, digits, spaces and . ' -, up to 30 (utils/displayName.ts). */
export const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,29}$/u;
/** A game's name, in characters. */
export const GAME_MIN = 2;
export const GAME_MAX = 80;
/** A friend's note, in characters. */
export const NOTE_MAX = 200;

/** Wishlist sections a game is filed under (WISHLIST_SECTIONS on the client). */
export const WISHLIST_SECTION_IDS = ['party', 'strategy', 'coop', 'two-player', 'heavy'] as const;
export type WishlistSection = (typeof WISHLIST_SECTION_IDS)[number];

/** The keyword ids the client knows (KW on the client). */
export const KEYWORD_IDS = [
  'social',
  'bluffing',
  'deduction',
  'strategy',
  'negotiation',
  'abstract',
  'deck-building',
  'cooperative',
  'team',
  'party',
  'adult',
  'active',
  'creative',
  'card-game',
  'word',
  'family',
  'classic',
  'thematic',
  'portable',
  'quick-play',
] as const;
