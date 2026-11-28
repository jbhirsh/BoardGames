// The BoardGameGeek id the owner types or pastes for a wishlist game (#367).
//
// Pure, so it tests directly (bggId.property.test.ts): it takes outside input
// and never throws.

/** The biggest id a `bgg_id` column holds: a 32-bit signed integer. */
const ID_MAX = 2_147_483_647;

/** `boardgamegeek.com/boardgame/453740/container`, with or without the scheme, `www.` and slug. */
const LINK_RE = /^(?:https?:\/\/)?(?:www\.)?boardgamegeek\.com\/(?:boardgame|boardgameexpansion)\/(\d+)(?:[/?#].*)?$/i;

/**
 * The id a pasted BGG game link or a bare number names, or null for anything
 * else (a zero, a negative, a decimal, another site, another kind of page).
 */
export function parseBggId(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  const digits = /^\d+$/.test(text) ? text : LINK_RE.exec(text)?.[1];
  if (digits === undefined) return null;
  const id = Number(digits);
  return Number.isSafeInteger(id) && id > 0 && id <= ID_MAX ? id : null;
}
