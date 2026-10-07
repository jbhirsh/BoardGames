// Find-in-rulebook for the phone reader. A PDF page's text arrives as a list
// of items (runs of text in one font), and the reader draws one transparent
// span per item over the page image. Search runs over the page's items joined
// into one string, so a phrase split across items still matches, and each
// match maps back to the items it covers so it can be highlighted in place.

/** One text item: what pdf.js's getTextContent returns for a run of text. */
export interface TextRun {
  str: string;
  hasEOL?: boolean;
}

/** A page's text as one string, with where each item starts in it. */
export interface PageText {
  text: string;
  starts: number[];
}

/** A match as [start, end) offsets into a page's text. */
export type Match = readonly [number, number];

/** The part of one item a match covers, as [from, to) offsets into its str. */
export interface Piece {
  item: number;
  from: number;
  to: number;
}

export function pageText(runs: readonly TextRun[]): PageText {
  let text = '';
  const starts: number[] = [];
  for (const run of runs) {
    starts.push(text.length);
    text += run.str;
    if (run.hasEOL) text += '\n';
  }
  return { text, starts };
}

/**
 * Every place the query occurs, ignoring case. Spaces in the query match any
 * run of whitespace, or none, since PDFs often drop or split the space
 * between words across items.
 */
export function findMatches(text: string, query: string): Match[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  const found: Match[] = [];
  for (const m of text.matchAll(new RegExp(pattern, 'giu'))) {
    found.push([m.index, m.index + m[0].length]);
  }
  return found;
}

/** The pieces of each item a match covers, in item order. */
export function piecesOf(page: PageText, runs: readonly TextRun[], [start, end]: Match): Piece[] {
  const pieces: Piece[] = [];
  page.starts.forEach((itemStart, item) => {
    const from = Math.max(start, itemStart) - itemStart;
    const to = Math.min(end, itemStart + runs[item].str.length) - itemStart;
    if (to > from) pieces.push({ item, from, to });
  });
  return pieces;
}
