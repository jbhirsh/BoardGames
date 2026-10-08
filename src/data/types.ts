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
 * What a game inside another one is: an expansion adds rules or pieces, an
 * extension adds seats, a version is a complete game of its own in the same
 * line (Ticket to Ride - Europe), and a card game is one played with the
 * parent's deck.
 */
export type SubGameKind = 'expansion' | 'extension' | 'version' | 'card-game';

/** A further rulebook for a game or a game inside one; its tab is `label`. */
export interface ExtraRulebook {
  slug: string;
  label: string;
  pdf: string;
}

/** One of our table's changes to a game's printed rules. */
export interface HouseRule {
  name: string;
  /** What to do, in plain text. */
  text: string;
}

/**
 * A game that lives under another one: Catan's add-ons, or the games a deck of
 * cards plays. Each has its own players, time, video and (usually) rulebook, so
 * the filters can find the parent through it.
 */
export interface SubGame {
  name: string;
  /** Unique within the parent; its rulebook is /rules/<parent>.<slug>.pdf. */
  slug: string;
  kind: SubGameKind;
  players: string;
  min: number;
  max: number;
  dur: string;
  mins: number;
  cat: DurationCategory;
  short: string;
  yt: string;
  /** Absent when no rulebook is bundled (the rules came in the box). */
  rules?: string;
  /** The tab for `rules`; the sub-game's name when absent. */
  rulesLabel?: string;
  /**
   * Further rulebooks for this sub-game, like the Monster Box's sheets for
   * Boxes 2 to 4, each a tab after its own. Their slugs share the parent's
   * namespace: /rules/<parent>.<slug>.pdf.
   */
  moreRules?: ExtraRulebook[];
  /** Confirmed award wins of its own, like a game's. */
  awards?: Award[];
  /** The fuller description its row opens to, after `short`. */
  desc?: string;
  /** Detail sections, HTML like a game's `detail`, shown under `desc`. */
  detail?: string;
}

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
  /** Games inside this one; the filters match the item when it or any of these fits. */
  subgames?: SubGame[];
}

export interface Game extends Filterable {
  slug: string;
  img: string;
  rules: string;
  /** The rules page's tab for `rules`; "Base game" (or "Overview" for a deck) when absent. */
  rulesLabel?: string;
  /**
   * More rulebooks for this same game, such as Hogwarts Battle's sheets for
   * Games 2 to 7, each a tab at /rules/<game>.<slug>.pdf. They build on the
   * game's own rules and on each other, so the rules assistant reads the one
   * on screen and those before it.
   */
  moreRules?: ExtraRulebook[];
  /**
   * The ways we play it differently from the printed rules, listed above the
   * rulebook on every tab of its rules page (an add-on's tabs included, since
   * it is played on top of the game).
   */
  houseRules?: HouseRule[];
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
  /** BoardGameGeek id of a compiled-in entry; `npm run wishlist-art` fetches its box art by this. */
  bgg?: number;
  yt: string;
  players: string;
  type: WishlistType;
  awards: Award[];
  /** Amazon product id of the standard edition, when verified; buy links fall back to a search without it. */
  asin?: string;
  /** Box art: a bundled file for compiled-in entries (see wishlistArt.ts), a BGG thumbnail for suggestions. */
  img?: string;
  /** Set on approved friend suggestions: the display name that suggested it. */
  suggestedBy?: string;
  /** Present on entries that live in the suggestions store (editable by the owner); absent on compiled-in entries. */
  source?: 'friend' | 'owner';
  /** The stored description on its own, without the credit line, for the owner's edit form. */
  blurb?: string;
  /**
   * The game this one adds to, by name, when it is an expansion. A name in
   * the collection is marked as owned, so nobody votes for it thinking it
   * plays on its own.
   */
  expands?: string;
}

/** The most minutes a game may take to show under the duration filter. */
export type TimeBudget = 15 | 30 | 60;
export type DurationFilter = 'all' | TimeBudget;
/** `votes` (most voted first) is the wishlist's alone: the collection has no votes. */
export type SortMode = 'az' | 'group' | 'quick' | 'long' | 'votes'
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
