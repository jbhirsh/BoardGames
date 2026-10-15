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
 * One section of a game's long write-up (`detail`), the part a card's More
 * and an open list row show: a heading over a paragraph of plain text.
 */
export interface DetailSection {
  heading: string;
  body: string;
}

/**
 * What a game and a game inside one both carry: who and how long it plays
 * for, its line and video, its rulebooks, awards and write-up.
 */
export interface TableInfo extends Pick<Filterable, 'name' | 'min' | 'max' | 'dur' | 'mins' | 'bgg' | 'weight'> {
  /**
   * Names its rulebook: a game's is /rules/<slug>.pdf, and a game inside
   * one, whose slug is unique within the game, /rules/<game>.<slug>.pdf.
   */
  slug: string;
  players: string;
  short: string;
  yt: string;
  /** Absent on a game inside another when no rulebook is bundled (the rules came in the box). */
  rules?: string;
  /**
   * The rules page's tab for `rules`; when absent, a game's says "Base
   * game" ("Overview" for a deck) and a game inside one's its name.
   */
  rulesLabel?: string;
  /**
   * Further rulebooks for the same game, each a tab after its own, such as
   * Hogwarts Battle's sheets for Games 2 to 7 or the Monster Box's for
   * Boxes 2 to 4. Their slugs share the game's namespace, at
   * /rules/<game>.<slug>.pdf. They build on its rules and on each other,
   * so the rules assistant reads the one on screen and those before it.
   */
  moreRules?: ExtraRulebook[];
  /** Confirmed award wins of its own. */
  awards?: Award[];
  /** The long write-up, a section at a time (a game inside one shows it under `desc`). */
  detail?: DetailSection[];
}

/**
 * A game that lives under another one: Catan's add-ons, or the games a deck of
 * cards plays. Each has its own players, time, video and (usually) rulebook, so
 * the filters can find the parent through it. A deck's games and versions
 * have a weight; add-ons don't.
 */
export interface SubGame extends TableInfo {
  kind: SubGameKind;
  /** The fuller description its row opens to, after `short`. */
  desc?: string;
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
  kw: KeywordId[];
  /**
   * BoardGameGeek id. A game's difficulty is BGG's weight for it
   * (`npm run game-weights`); a compiled-in wishlist entry's box art is
   * fetched by it (`npm run wishlist-art`).
   */
  bgg?: number;
  /**
   * How heavy it is to learn: BoardGameGeek's community weight, 1 (light)
   * to 5 (heavy), set from `bgg` (src/data/gameWeights.ts, never typed in);
   * shown as Light, Medium or Heavy with the number. Absent where BGG has
   * no rating, and on a deck, whose games each carry their own.
   */
  weight?: number;
  /** Games inside this one; the filters match the item when it or any of these fits. */
  subgames?: SubGame[];
}

export interface Game extends Filterable, TableInfo {
  /** Box art, /images/<slug>.webp unless its entry names another (games.ts fills both in). */
  img: string;
  /** Its own rulebook, /rules/<slug>.pdf. */
  rules: string;
  /**
   * The ways we play it differently from the printed rules, listed above the
   * rulebook on every tab of its rules page (an add-on's tabs included, since
   * it is played on top of the game).
   */
  houseRules?: HouseRule[];
  group: GroupId;
  detail: DetailSection[];
  awards: Award[];
}

/** A game with games inside it, as the add-ons tag and list take it. */
export type GameWithSubgames = Game & { subgames: SubGame[] };

export type WishlistType = 'two-player' | 'coop' | 'strategy' | 'heavy' | 'party' | 'suggested';
/** The sections the owner can file a game under: every type but the friends' one. */
export type WishlistSection = Exclude<WishlistType, 'suggested'>;

/** One confirmed award win from a recognised body (nominations excluded). */
export interface Award {
  name: string;
  year: number;
}

/** What every wishlist entry carries, compiled in or stored. */
interface WishlistEntry extends Filterable {
  id: string;
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
  /**
   * The game this one adds to, by name, when it is an expansion. A name in
   * the collection is marked as owned, so nobody votes for it thinking it
   * plays on its own.
   */
  expands?: string;
}

/** An entry compiled in from wishlist.ts, edited in the source. */
export interface CompiledWishlistItem extends WishlistEntry {
  source?: undefined;
}

/** An entry that lives in the suggestions store, which the signed-in owner can edit or remove. */
export interface StoredWishlistItem extends WishlistEntry {
  /** A friend's approved suggestion, or a game the owner added. */
  source: 'friend' | 'owner';
  /** The stored description on its own, without the credit line, for the owner's edit form. */
  blurb: string;
}

export type WishlistItem = CompiledWishlistItem | StoredWishlistItem;

/** The most minutes a game may take to show under the duration filter. */
export type TimeBudget = 15 | 30 | 60;
export type DurationFilter = 'all' | TimeBudget;
/** The list view's sortable columns; `weight` (difficulty) is the collection's alone. */
export type SortColumn = 'name' | 'players' | 'dur' | 'weight';
/** A click on a column header sorts by it one way, a second click the other. */
export type ColumnSort = `${SortColumn}-${'asc' | 'desc'}`;
/**
 * The filter bar's sorts, the only ones a link carries. `votes` (most voted
 * first) is the wishlist's alone: the collection has no votes.
 */
export type BaseSort = 'az' | 'group' | 'quick' | 'long' | 'votes';
export type SortMode = BaseSort | ColumnSort;
export type ViewMode = 'grid' | 'list';
/** Which list the filter bar drives: the games we own or the ones we want. */
export type CollectionMode = 'own' | 'want';
export type KeywordMode = 'and' | 'or';

/**
 * The filter bar's state, mirrored to the URL (utils/filterUrl.ts) so a view
 * can be shared. `duration` is a time budget (d=15|30|60): a game fits by
 * its own `mins`, quick ones included; its Quick, Medium or Long bucket only
 * colours its time pill (utils/duration.ts). `collection` (c=want) picks the
 * list the section shows and the keyword counts tally; Clear all keeps it.
 */
export interface FilterState {
  duration: DurationFilter;
  players: number;
  keywords: Set<KeywordId>;
  keywordMode: KeywordMode;
  search: string;
  sort: SortMode;
  /** The filter bar's sort, which a column sort sits on and Clear all returns to. */
  baseSort: BaseSort;
  view: ViewMode;
  collection: CollectionMode;
}
