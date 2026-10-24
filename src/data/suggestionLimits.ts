// The bounds api/_resolvers/suggestions.ts puts on a wishlist entry, for the forms that
// send one. The two trees can't import each other, so these are mirrored by
// hand and a test keeps them in step: a form looser than the API lets the
// API reject what was typed, a stricter one blocks what the API would take.

/** A game's name, in characters. */
export const GAME_MIN = 2;
export const GAME_MAX = 80;
/** A suggester's display name, in characters (the length NAME_RE allows). */
export const NAME_MAX = 30;
/** The note shown on the card in quotes, in characters. */
export const NOTE_MAX = 200;
/** A game's description, the owner's or BGG's whole one, in characters. */
export const DESC_MAX = 5000;
/** The most players the owner can set. */
export const PLAYERS_MAX = 99;
/** The longest playing time the owner can set, in minutes. */
export const MINS_MAX = 600;
