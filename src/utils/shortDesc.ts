/**
 * The first sentence of a description, for the one-line summary a table row
 * shows before it is expanded. Collection games carry a hand-written short
 * line; wishlist entries only have the full blurb, so this stands in for it.
 */
export function shortDesc(desc: string): string {
  // A closing quote or bracket after the stop stays with the sentence.
  const m = /^(.*?[.!?][\u201d"')\]]*)(?=\s|$)/s.exec(desc.trim());
  return m ? m[1] : desc.trim();
}
