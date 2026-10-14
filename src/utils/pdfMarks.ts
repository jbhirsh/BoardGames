// Which parts of a rulebook page's text items the reader highlights: every
// search match, the current one stronger, and the passage a citation points
// to like a match. Planned here, apart from the text layer, so the overlap
// rules can be tested without pdf.js; the reader then wraps each planned
// stretch of an item's text in a <mark>.

import { piecesOf, type Match, type PageText, type TextRun } from './pdfSearch';

/** A stretch of one item's text to mark, as [from, to) offsets into its str. */
export interface Marked {
  from: number;
  to: number;
  className: string;
  /** Whether this is (part of) the current match, which the reader scrolls to. */
  isCurrent: boolean;
}

/**
 * The marks for each item of a page, keyed by item index, each item's in
 * text order. The items come in the order the matches reach them (so the
 * first current mark met is the current match's start), then any only the
 * cited passage reaches. The passage only fills the gaps between matches,
 * so a search's matches inside it stay marked as matches, the current one
 * too.
 */
export function planMarks(
  page: PageText,
  runs: readonly TextRun[],
  matches: readonly Match[],
  current: Match | null,
  quoted: Match | null,
): Map<number, Marked[]> {
  const byItem = new Map<number, Marked[]>();
  for (const match of matches) {
    const className = match === current ? 'pdf-hit pdf-hit--current' : 'pdf-hit';
    for (const { item, from, to } of piecesOf(page, runs, match)) {
      byItem.set(item, [...(byItem.get(item) ?? []), { from, to, className, isCurrent: match === current }]);
    }
  }
  for (const piece of quoted ? piecesOf(page, runs, quoted) : []) {
    const hits = byItem.get(piece.item) ?? [];
    const cited: Marked[] = [];
    let from = piece.from;
    for (const hit of [...hits, { from: piece.to, to: piece.to }].sort((a, b) => a.from - b.from)) {
      const to = Math.min(hit.from, piece.to);
      if (to > from) cited.push({ from, to, className: 'pdf-hit pdf-hit--cited', isCurrent: false });
      from = Math.max(from, hit.to);
    }
    byItem.set(piece.item, [...hits, ...cited]);
  }
  for (const marks of byItem.values()) marks.sort((a, b) => a.from - b.from);
  return byItem;
}
