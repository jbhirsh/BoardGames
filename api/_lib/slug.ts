/**
 * Shared slug/id shape: lowercase alphanumeric plus hyphens, 1–64 chars,
 * leading alphanumeric. Used for the chat rules-text filename lookup and for
 * game ids (the ones votes, edits and removals name) alike, kept in one place
 * so the endpoints can't drift apart (each feeds user input into a path or a
 * query).
 */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Whether an id can name a friend's suggestion. Every one is minted as
 * `sug-…`; the prefix also keeps a request from naming one of the id lists
 * that share the `suggestions:` key space (`suggestions:active` and the
 * rest), which a hash read would answer with a WRONGTYPE error.
 */
export const isSuggestionId = (id: string): boolean => id.startsWith('sug-');
