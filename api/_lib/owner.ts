// Who the owner is: the signed-in account whose email is SUGGESTIONS_TO
// (ownerEmail in mail.ts), once Google has verified it (api/_auth.ts).

/** An address as compared: trimmed and case-folded. */
const normalize = (email: string) => email.trim().toLowerCase();

/**
 * Whether `email` is the owner's address. Anything but a non-empty string
 * on either side is no one's, so a missing setting or a user without an
 * email never matches.
 */
export function isOwnerEmail(email: unknown, owner: string | null | undefined): boolean {
  if (typeof email !== 'string' || typeof owner !== 'string') return false;
  const wanted = normalize(owner);
  return wanted !== '' && normalize(email) === wanted;
}
